# -*- coding: utf-8 -*-
"""회원 계정 관리 CLI. 공개 회원가입 대신 이 명령으로 팀원 계정을 만든다.

사용(backend 폴더에서, venv 파이썬으로):
  python -m auth.manage add <아이디> <비밀번호> [표시이름]   회원 추가
  python -m auth.manage list                                회원 목록
  python -m auth.manage passwd <아이디> <새 비밀번호>        비밀번호 변경
  python -m auth.manage delete <아이디>                      회원 삭제

예) python -m auth.manage add krs 1234 "관리자"
배포 서버(Render)에서는 Shell 탭에서 동일하게 실행한다.
"""

from __future__ import annotations

import sys

from . import store


def _usage_and_exit() -> None:
    print(__doc__)
    raise SystemExit(1)


def main(argv: list[str]) -> None:
    if not argv:
        _usage_and_exit()
    cmd = argv[0]

    if cmd == "add":
        if len(argv) < 3:
            _usage_and_exit()
        login_id, password = argv[1], argv[2]
        display_name = argv[3] if len(argv) > 3 else None
        try:
            user = store.create_user(login_id, password, display_name)
        except ValueError as ex:
            print("실패:", ex)
            raise SystemExit(1)
        print("회원 추가됨: %s (표시이름: %s)" % (user["loginId"], user["displayName"]))

    elif cmd == "list":
        users = store.list_users()
        if not users:
            print("(회원이 없습니다. 'add'로 먼저 추가하세요.)")
        for u in users:
            print("- %s | %s | 가입 %s" % (u["loginId"], u["displayName"], u["createdAt"]))

    elif cmd == "passwd":
        if len(argv) < 3:
            _usage_and_exit()
        ok = store.set_password(argv[1], argv[2])
        print("비밀번호 변경됨." if ok else "실패: 그런 아이디가 없습니다.")
        if not ok:
            raise SystemExit(1)

    elif cmd == "delete":
        if len(argv) < 2:
            _usage_and_exit()
        ok = store.delete_user(argv[1])
        print("삭제됨." if ok else "실패: 그런 아이디가 없습니다.")
        if not ok:
            raise SystemExit(1)

    else:
        _usage_and_exit()


if __name__ == "__main__":
    main(sys.argv[1:])
