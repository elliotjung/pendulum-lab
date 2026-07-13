/** Browser-only adapters. Import this subpath only in DOM-capable runtimes. */
export { installJsonImportGuard } from '../browser/installJsonImportGuard';
export { scaleCanvasToPngDataUrl } from '../browser/figureRaster';
export { VideoMarkerCaptureController } from '../browser/videoMarkerCapture';
export type {
  VideoMarkerCaptureDependencies,
  VideoMarkerCaptureOptions,
  VideoMarkerCaptureState,
  VideoMarkerSample
} from '../browser/videoMarkerCapture';
export { ImuMotionCaptureController } from '../browser/imuMotionCapture';
export type {
  ImuAxis,
  ImuCaptureState,
  ImuMotionCaptureDependencies,
  ImuMotionCaptureOptions,
  ImuMotionSample
} from '../browser/imuMotionCapture';
export { OrbitCamera, bindOrbitControls, drawPolyline3D, drawSphereWireframe } from '../viz/orbit3d';
export type { OrbitCameraState, PolylinePoint3 } from '../viz/orbit3d';
