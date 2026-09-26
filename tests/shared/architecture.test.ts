import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const SRC = join(__dirname, '..', '..', 'src');
const MODULES = ['activities', 'programmes', 'staff', 'alerts', 'reports'] as const;

const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });

const sourceFiles = walk(SRC).filter((file) => file.endsWith('.ts'));

const read = (file: string): string => readFileSync(file, 'utf8');

const moduleOf = (file: string): string | undefined =>
  MODULES.find((name) => file.includes(join(SRC, name)));

describe('architecture rule 1: three layers per module', () => {
  it.each(MODULES)('%s has service and repository layers', (module) => {
    const files = sourceFiles.filter((file) => file.includes(join(SRC, module)));
    expect(files.some((file) => file.endsWith('service.ts'))).toBe(true);
    expect(files.some((file) => file.endsWith('repository.ts'))).toBe(true);
    expect(files.some((file) => file.endsWith('types.ts'))).toBe(true);
  });

  it('routes never talk to a repository directly', () => {
    const offenders = sourceFiles
      .filter((file) => file.endsWith('routes.ts'))
      .filter((file) => /from '[^']*repository'/.test(read(file)));
    expect(offenders).toEqual([]);
  });
});

describe('architecture rule 2: module boundaries', () => {
  it('no module imports another module repository', () => {
    const offenders: string[] = [];

    for (const file of sourceFiles) {
      const owner = moduleOf(file);
      if (owner === undefined) {
        continue;
      }
      for (const other of MODULES) {
        if (other === owner) {
          continue;
        }
        if (read(file).includes(`../${other}/repository`)) {
          offenders.push(`${file} -> ${other}/repository`);
        }
      }
    }

    expect(offenders).toEqual([]);
  });

  it('shared never imports a domain module', () => {
    const offenders = sourceFiles
      .filter((file) => file.includes(join(SRC, 'shared')))
      .filter((file) => MODULES.some((module) => read(file).includes(`../../${module}/`)));
    expect(offenders).toEqual([]);
  });
});

describe('architecture rule 4: typed errors only', () => {
  it('services and routes never throw a raw Error', () => {
    const offenders = sourceFiles
      .filter((file) => file.endsWith('service.ts') || file.endsWith('routes.ts'))
      .filter((file) => read(file).includes('throw new Error('));
    expect(offenders).toEqual([]);
  });
});

describe('architecture rule 5: reports is read-only', () => {
  const reportService = read(join(SRC, 'reports', 'service.ts'));

  it.each(['activities', 'programmes', 'staff'])(
    'never mutates the %s module',
    (dependency: string) => {
      const alias = dependency === 'activities' ? 'activities' : dependency;
      for (const mutator of ['create', 'update', 'delete']) {
        expect(reportService).not.toContain(`this.${alias}.${mutator}`);
      }
    },
  );

  it('reads its dependencies through their service layers', () => {
    expect(reportService).toContain("from '../activities/service'");
    expect(reportService).toContain("from '../programmes/service'");
    expect(reportService).toContain("from '../staff/service'");
  });

  it('has no HTTP surface yet', () => {
    const reportFiles = sourceFiles.filter((file) => file.includes(join(SRC, 'reports')));
    expect(reportFiles.some((file) => file.endsWith('routes.ts'))).toBe(false);
  });
});
