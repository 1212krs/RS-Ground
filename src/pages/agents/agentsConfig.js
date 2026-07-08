import { Calculator, ScrollText } from 'lucide-react'

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
