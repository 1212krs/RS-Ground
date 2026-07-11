import { Calculator, ScrollText, ClipboardList, GraduationCap } from 'lucide-react'

// 앱형 에이전트: 채팅(scope)이 아니라 자기 전용 화면(route)을 여는 에이전트.
export const APP_AGENTS = [
  {
    id: 'meeting',
    name: '회의록 정리',
    route: '/meeting',
    icon: ClipboardList,
    accent: '#6C5CE7',
    desc: '회의 전문을 붙여넣으면 마인드맵·용어 설명·할 일·일정으로 정리합니다.',
  },
  {
    id: 'study',
    name: '공부 노트',
    route: '/study',
    icon: GraduationCap,
    accent: '#1FA25A',
    desc: '필기·자료를 마크다운으로 쓰고 파일을 첨부해 과목별로 모으고 검색합니다.',
  },
]

// 에이전트 = (검색 필터 scope) + (성격/소개). 임베딩 창고는 전체가 공유하고,
// 에이전트마다 scope(category_l1)만 다르게 걸어 '자기 분야 문서'만 검색한다.
// 새 에이전트 추가 = 이 배열에 항목 하나. (문서를 그 분류로 올려두면 바로 동작)
export const AGENTS = [
  {
    id: 'accounting',
    name: '회계챗',
    scope: '회계',          // category_l1 필터
    icon: Calculator,
    accent: '#AEE63E',
    desc: '지방회계실무 교재를 근거로 회계·계약·지출 질문에 답합니다.',
  },
]

// 앞으로 붙을 자리(문서 분류만 만들면 활성화). 확장 방식을 화면에 보여주기 위한 예시.
export const UPCOMING_AGENTS = [
  { id: 'contract', name: '계약챗', icon: ScrollText, desc: '계약·입찰 분야 전용 (문서 분류 준비 중)' },
]
