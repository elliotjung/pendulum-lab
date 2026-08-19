import type { AudienceMode } from './audienceModePolicy';

export type AudienceIconName =
  | 'spark'
  | 'chart'
  | 'lab'
  | 'explore'
  | 'analyze'
  | 'chaos'
  | 'validate'
  | 'export'
  | 'play'
  | 'compare'
  | 'spectrum'
  | 'grid'
  | 'branch'
  | 'cube'
  | 'density'
  | 'binary'
  | 'vectors'
  | 'basin'
  | 'recurrence'
  | 'field'
  | 'manifest'
  | 'shield'
  | 'command'
  | 'report'
  | 'orbit';

export const AUDIENCE_MODES: Record<
  AudienceMode,
  { label: string; description: string; summary: string; icon: AudienceIconName }
> = {
  beginner: {
    label: 'Beginner',
    description: 'Simulator-first view with presets and core physical controls only.',
    summary: 'Explore motion without paper, audit, or advanced numeric surfaces.',
    icon: 'spark'
  },
  student: {
    label: 'Student',
    description: 'Adds analysis plots, validation, exports, and method controls.',
    summary: 'Study plots, compare behavior, and check numerical accuracy.',
    icon: 'chart'
  },
  research: {
    label: 'Research',
    description: 'Full diagnostics, Trust Inspector evidence, reviewer kit, governance, and audit tools.',
    summary: 'Run diagnostics with provenance, caveats, artifacts, and reviewer commands visible.',
    icon: 'lab'
  }
};

export const AUDIENCE_MODES_KO: Record<AudienceMode, { label: string; description: string; summary: string }> = {
  beginner: {
    label: '초보',
    description: '프리셋과 핵심 물리 조절기에 집중한 시뮬레이터 화면입니다.',
    summary: '논문·감사·고급 수치 도구 없이 진자의 움직임부터 탐색합니다.'
  },
  student: {
    label: '학생',
    description: '분석 그래프, 검증, 내보내기, 수치해석 방법 조절기를 추가합니다.',
    summary: '그래프를 읽고 거동을 비교하며 수치 정확도를 확인합니다.'
  },
  research: {
    label: '연구',
    description: '전체 진단, Trust Inspector 근거, 리뷰어 키트, 거버넌스, 감사 도구를 엽니다.',
    summary: '출처·주의점·산출물·재현 명령을 보며 연구 진단을 실행합니다.'
  }
};
