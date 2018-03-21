module.exports = {
  extends: 'airbnb-base',
  rules: {
    'max-len': ['warn', 120, 2, {
      ignoreUrls: true,
      ignoreComments: false,
      ignoreRegExpLiterals: true,
      ignoreStrings: true,
      ignoreTemplateLiterals: true,
    }],
    'no-underscore-dangle': ['error', {
      allow: [
        '__',
      ],
    }],
    'quote-props': ['error', 'as-needed', {
      keywords: true,
      unnecessary: false,
      numbers: true,
    }],
  },
};
