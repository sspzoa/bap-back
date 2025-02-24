import { server } from './server';

/**
 * 프로젝트 진입점(Entry Point)
 * - Bun 환경에서는 server.ts를 바로 실행해도 되지만,
 *   필요 시 추가 초기화 로직이나 DB 연결 등을 여기서 처리할 수 있음
 */
console.log(`Server running at http://localhost:${server.port}`);
// 별도의 초기화 로직이 있다면 이곳에 추가
// 예: DB 연결, 환경변수 체크, etc.

// server 실행은 server.ts 내부에서 이미 `serve()`를 통해 동작
