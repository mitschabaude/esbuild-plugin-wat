import {PluginBuild} from 'esbuild';

export default function watPlugin(options?: {
  loader?: 'binary' | 'base64' | 'file' | 'dataurl';
  inlineFunctions?: boolean;
  bundle?: boolean;
  wrap?: boolean;
  ignoreCache?: boolean;
}): {
  name: 'esbuild-plugin-wat';
  setup: (build: PluginBuild) => void;
};
