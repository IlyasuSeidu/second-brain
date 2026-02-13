module.exports = {
  extends: [
    "./base.cjs",
    "plugin:react/recommended",
    "plugin:react-hooks/recommended",
    "plugin:react-native/all",
  ],
  plugins: ["react", "react-hooks", "react-native"],
  settings: {
    react: {
      version: "detect",
    },
  },
  env: {
    "react-native/react-native": true,
  },
  rules: {
    "import/namespace": "off",
    "react-native/no-inline-styles": "off",
    "react-native/no-color-literals": "off",
    "react-native/sort-styles": "off",
    "react/react-in-jsx-scope": "off",
  },
};
