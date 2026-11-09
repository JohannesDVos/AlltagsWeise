import js from '@eslint/js';
import ts from 'typescript-eslint';
export default [{ignores:['dist/**','node_modules/**']},js.configs.recommended,...ts.configs.recommended];
