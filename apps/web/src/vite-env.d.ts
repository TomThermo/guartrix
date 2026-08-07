/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_PORT?: string;
  readonly VITE_APP_VERSION?: string;
  readonly VITE_SENTRY_DSN?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

interface MonacoEnvironment {
  getWorker(workerId: string, label: string): Worker;
}

interface Window {
  MonacoEnvironment?: MonacoEnvironment;
}

declare module "monaco-editor/editor/editor.worker?worker" {
  const WorkerFactory: new () => Worker;
  export default WorkerFactory;
}
declare module "monaco-editor/language/json/json.worker?worker" {
  const WorkerFactory: new () => Worker;
  export default WorkerFactory;
}
declare module "monaco-editor/language/css/css.worker?worker" {
  const WorkerFactory: new () => Worker;
  export default WorkerFactory;
}
declare module "monaco-editor/language/html/html.worker?worker" {
  const WorkerFactory: new () => Worker;
  export default WorkerFactory;
}
declare module "monaco-editor/language/typescript/ts.worker?worker" {
  const WorkerFactory: new () => Worker;
  export default WorkerFactory;
}
