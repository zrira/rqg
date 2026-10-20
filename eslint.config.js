import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['**/dist/**', '**/coverage/**', '**/node_modules/**'] },
  eslint.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: {
          allowDefaultProject: ['*.js', '*.ts'],
        },
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    files: ['**/*.{js,mjs}'],
    ...tseslint.configs.disableTypeChecked,
    languageOptions: {
      parserOptions: {
        project: false,
        projectService: false,
      },
    },
  },
);
