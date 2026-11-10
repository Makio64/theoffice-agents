// Development uses the source filenames. The publish build replaces this module
// with the content-addressed image lookup, including paths assembled at runtime.
export const assetPath = file => file;
