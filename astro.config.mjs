import { defineConfig } from 'astro/config';
import node from '@astrojs/node';
import cron from 'node-cron';

function dramaCronIntegration() {
  return {
    name: 'drama-cron-integration',
    hooks: {
      'astro:config:done': () => {
        // 크론 표현식: 매주 월요일 00시 00분 (0 0 * * 1)
        cron.schedule('0 0 * * 1', async () => {
          console.log('[Cron] 주간 드라마 데이터 수집 시작...');
          const { collectAndSaveDramaData } = await import('./src/services/dramaCollector');
          await collectAndSaveDramaData('KR');
        });
        console.log('[Integration] 드라마 스케줄러가 등록되었습니다. (매주 월요일 00시)');
      }
    }
  };
}

export default defineConfig({
  output: 'server',
  adapter: node({ mode: 'standalone' }),
  integrations: [dramaCronIntegration()]
});
