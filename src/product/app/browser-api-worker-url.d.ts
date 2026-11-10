/** Vite emits the unchanged native worker as a compiled production asset. */
declare module '*?worker&url' {
  const workerUrl: string;
  export default workerUrl;
}
