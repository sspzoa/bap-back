# bap-back

학교별 급식 API. 프로바이더: `kdmhs` (한국디지털미디어고등학교), `dgu` (동국대학교 경영관 D-Flex).

| 경로 | 프로바이더 |
|------|------------|
| `GET /:date`, `GET /kdmhs/:date` | KDMHS |
| `GET /search/:food`, `GET /kdmhs/search/:food` | KDMHS |
| `GET /dgu/:date` | DGU |

루트 경로는 KDMHS 하위호환용 alias입니다. 신규 클라이언트는 `/kdmhs`를 쓰면 됩니다.
