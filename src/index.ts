import { server } from './server';

/**
 * 프로젝트 진입점(Entry Point)
 * - 서버와 크론 작업은 server.ts에서 자동으로 설정됨
 */
console.log(`Server running at http://localhost:${server.port}`);