export default function watPlugin(options?: {
  loader?: 'binary' | 'base64' | 'file' | 'dataurl';
  inlineFunctions?: boolean;
  bundle?: boolean;
}): {
  name: 'esbuild-plugin-wat';
  setup: (build: unknown) => void;
};
