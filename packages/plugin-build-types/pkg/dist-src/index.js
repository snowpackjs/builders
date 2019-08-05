import path from 'path';
import fs from 'fs';
import mkdirp from 'mkdirp';
import execa from 'execa';
import { MessageError } from '@pika/types';
function getTsConfigPath(options, cwd) {
    return path.resolve(cwd, options.tsconfig || 'tsconfig.json');
}
export function manifest(manifest) {
    manifest.types = manifest.types || 'dist-types/index.d.ts';
}
export async function beforeBuild({ options, cwd }) {
    const tsConfigPath = getTsConfigPath(options, cwd);
    if (options.tsconfig && !fs.existsSync(tsConfigPath)) {
        throw new MessageError(`"${tsConfigPath}" file does not exist.`);
    }
}
export async function build({ cwd, out, options, reporter }) {
    await (async () => {
        const tscBin = path.join(cwd, 'node_modules/.bin/tsc');
        const writeToTypings = path.join(out, 'dist-types/index.d.ts');
        const importAsNode = path.join(out, 'dist-node', 'index.js');
        if (fs.existsSync(path.join(cwd, 'index.d.ts'))) {
            mkdirp.sync(path.dirname(writeToTypings));
            fs.copyFileSync(path.join(cwd, 'index.d.ts'), writeToTypings);
            return;
        }
        if (fs.existsSync(path.join(cwd, 'src', 'index.d.ts'))) {
            mkdirp.sync(path.dirname(writeToTypings));
            fs.copyFileSync(path.join(cwd, 'src', 'index.d.ts'), writeToTypings);
            return;
        }
        const tsConfigPath = getTsConfigPath(options, cwd);
        if (fs.existsSync(tscBin) && fs.existsSync(tsConfigPath)) {
            await execa(tscBin, [
                '-d',
                '--emitDeclarationOnly',
                '--declarationMap',
                'false',
                '--project',
                tsConfigPath,
                '--declarationDir',
                path.join(out, 'dist-types/'),
            ], { cwd });
            return;
        }
        // !!! Still experimental:
        // const dtTypesDependency = path.join(
        //   cwd,
        //   "node_modules",
        //   "@types",
        //   manifest.name
        // );
        // const dtTypesExist = fs.existsSync(dtTypesDependency);
        // if (dtTypesExist) {
        //   fs.copyFileSync(dtTypesDependency, writeToTypings);
        //   return;
        // }
        reporter.info('no type definitions found, auto-generating...');
        const tsc = (await import('typescript'));
        if (!tsc.generateTypesForModule) {
            console.error(`
  ⚠️  dist-types/: Attempted to generate type definitions, but "typescript@^3.5.0" no longer supports this.
                  Please either downgrade typescript, or author an "index.d.ts" type declaration file yourself.
                  See https://github.com/pikapkg/builders/issues/65 for more info.
  `);
            throw new Error(`Failed to build: dist-types/`);
        }
        const nodeImport = await import(importAsNode);
        const guessedTypes = tsc.generateTypesForModule('AutoGeneratedTypings', nodeImport, {});
        mkdirp.sync(path.dirname(writeToTypings));
        fs.writeFileSync(writeToTypings, guessedTypes);
    })();
    reporter.created(path.join(out, 'dist-types', 'index.d.ts'), 'types');
}
