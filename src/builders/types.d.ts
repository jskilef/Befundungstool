export type Status = 'pending' | 'normal' | 'abnormal' | 'limited';
export type Side = '' | 'right' | 'left' | 'bilateral';
export type Course = '' | 'new' | 'stable' | 'decreased' | 'increased' | 'resolved';
export type Style = 'short' | 'standard' | 'detailed';
/** Numeric input remains a string until runtime validation; blank means undocumented. */
export type Measurement = string;
export interface BaseFinding { status: Status; course: Course; limitation: string }
export interface PreviewText { befund: string; beurteilung: string }
export interface Preview extends PreviewText {
  lastBefund: string; lastBeurteilung: string; pending: boolean; auto: boolean;
  backup: PreviewText | null;
}
export interface ExaminationState<Id extends string, Mode extends string, Context, Findings> {
  version: 1; examinationId: Id; mode: Mode; reportStructure: 'combined' | 'separate';
  style: Style; context: Context; findings: Findings;
  comparison: { enabled: boolean; date: string };
  preview: Preview; lastTransfer: PreviewText | null;
  regionCache: Record<string, { context: Context; findings: Findings }>;
}
export type AspectRegion = 'C' | 'L' | 'IC' | 'I' | 'M1' | 'M2' | 'M3' | 'M4' | 'M5' | 'M6';
export type AspectRating = 'pending' | 'normal' | 'early' | 'limited';
export interface Hemorrhage {
  type: '' | 'epidural' | 'subdural' | 'subarachnoid' | 'intracerebral' | 'intraventricular';
  side: Side; location: string; size: Measurement; age: '' | 'acute' | 'subacute' | 'chronic' | 'mixed';
  massEffect: '' | 'none' | 'mild' | 'moderate' | 'severe'; shiftDirection: '' | 'right' | 'left';
  shiftMm: Measurement; ventricularCompression: boolean; herniation: boolean;
  edema: boolean; ventricularExtension: boolean; course: Course;
}
export interface HeadFindings {
  hemorrhage: BaseFinding & { items: Hemorrhage[] };
  aspects: BaseFinding & { right: Record<AspectRegion, AspectRating>; left: Record<AspectRegion, AspectRating> };
  [category: string]: BaseFinding & object;
}
export type HeadState = ExaminationState<'ct_head_native', 'routine' | 'trauma' | 'stroke' | 'followup', {
  examination: 'native' | 'contrast' | 'followup'; quality: '' | 'normal' | 'motion' | 'metal' | 'limited';
  question: string; questionText: string;
}, HeadFindings>;
export type SkeletonState = ExaminationState<'xray_skeleton', 'routine' | 'trauma' | 'followup' | 'postop', {
  region: string; side: Side; projections: string[]; projectionText: string;
  quality: '' | 'normal' | 'limited'; limitation: string; includeTechnique: boolean;
}, Record<string, BaseFinding & object>>;
export type EsophagramState = ExaminationState<'esophagram',
  'routine' | 'achalasia' | 'poem' | 'z_poem' | 'fundoplication' | 'esophagectomy' | 'postop', {
  contrast: '' | 'iodine' | 'barium'; position: string[]; acquisition: string[];
  quality: '' | 'normal' | 'limited'; limitation: string; includeTechnique: boolean;
}, Record<string, BaseFinding & object>>;
