# bap-back

학교별 급식 API. 각 프로바이더는 자기 `basePath`만 담당합니다.

| 경로 | 프로바이더 |
|------|------------|
| `GET /kdmhs/:date` | kdmhs |
| `GET /kdmhs/search/:food` | kdmhs |
| `GET /kdmhs/health` | kdmhs |
| `GET /dgu/:date` | dgu |
| `GET /dgu/health` | dgu |
| `GET /` | 등록된 프로바이더 목록 |

루트 `/:date` 같은 하위호환 경로는 없습니다.
