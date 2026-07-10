/** Browser-only adapters. Import this subpath only in DOM-capable runtimes. */
export { installJsonImportGuard } from '../browser/installJsonImportGuard';
export { scaleCanvasToPngDataUrl } from '../browser/figureRaster';
export { OrbitCamera, bindOrbitControls, drawPolyline3D, drawSphereWireframe } from '../viz/orbit3d';
export type { OrbitCameraState, PolylinePoint3 } from '../viz/orbit3d';
