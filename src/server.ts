import { serve } from 'bun';
import { handleCafeteriaRequest } from './routes/cafeteriaRoute';
import { CONFIG } from './config';
import { setupCronJob } from './utils/cron';
import { sqliteCache } from './utils/sqlite-cache';
import { getConvenienceMealData, getAllConvenienceMealData } from './services/convenienceService';

export const server = serve({
  port: CONFIG.PORT,
  async fetch(req: Request) {
    const url = new URL(req.url);
    const path = url.pathname;

    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    };

    if (req.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: corsHeaders
      });
    }

    if (path === '/clear-cache' && req.method === 'POST') {
      const keys = sqliteCache.getAllKeys().filter(key =>
        key === 'cafeteria_menu_posts' ||
        key.startsWith('cafeteria_') ||
        key.startsWith('meal_data_') ||
        key.startsWith('combined_menu_')
      );

      for (const key of keys) {
        sqliteCache.delete(key);
      }

      return new Response(JSON.stringify({ success: true, message: 'Cafeteria cache cleared' }), {
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
        },
      });
    }

    if (path === '/clear-convenience-cache' && req.method === 'POST') {
      const keys = sqliteCache.getAllKeys().filter(key =>
        key.startsWith('convenience_') ||
        key === 'convenience_all_data' ||
        key.startsWith('combined_menu_')
      );

      for (const key of keys) {
        sqliteCache.delete(key);
      }

      return new Response(JSON.stringify({ success: true, message: 'Convenience cache cleared' }), {
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
        },
      });
    }

    if (path === '/health') {
      const today = new Date();
      const todayFormatted = today.getFullYear() + '-' +
        String(today.getMonth() + 1).padStart(2, '0') + '-' +
        String(today.getDate()).padStart(2, '0');

      return new Response(JSON.stringify({
        status: 'ok',
        cacheStatus: {
          menu_posts: sqliteCache.has('cafeteria_menu_posts'),
          today_menu: sqliteCache.has(`cafeteria_${todayFormatted}`),
          convenience_data: sqliteCache.has(`convenience_${todayFormatted}`)
        }
      }), {
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
        },
      });
    }

    if (path === '/get-convenience') {
      const keys = sqliteCache.getAllKeys().filter(key =>
        key.startsWith('convenience_') ||
        key === 'convenience_all_data' ||
        key.startsWith('combined_menu_')
      );

      for (const key of keys) {
        sqliteCache.delete(key);
      }

      const dateParam = url.searchParams.get('date');

      if (!dateParam) {
        try {
          const allConvenienceData = await getAllConvenienceMealData();

          if (Object.keys(allConvenienceData).length === 0) {
            return new Response(JSON.stringify({ message: 'No convenience meal data available' }), {
              status: 200,
              headers: {
                ...corsHeaders,
                'Content-Type': 'application/json',
              },
            });
          }

          return new Response(JSON.stringify(allConvenienceData), {
            status: 200,
            headers: {
              ...corsHeaders,
              'Content-Type': 'application/json',
            },
          });
        } catch (error) {
          console.error('Error fetching all convenience data:', error);
          return new Response(JSON.stringify({ error: 'Failed to fetch convenience meal data' }), {
            status: 500,
            headers: {
              ...corsHeaders,
              'Content-Type': 'application/json',
            },
          });
        }
      }

      try {
        const convenienceData = await getConvenienceMealData(dateParam);
        if (!convenienceData) {
          return new Response(JSON.stringify({ error: 'Convenience meal data not found' }), {
            status: 404,
            headers: {
              ...corsHeaders,
              'Content-Type': 'application/json',
            },
          });
        }

        return new Response(JSON.stringify(convenienceData), {
          status: 200,
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json',
          },
        });
      } catch (error) {
        console.error('Error fetching convenience data:', error);
        return new Response(JSON.stringify({ error: 'Failed to fetch convenience meal data' }), {
          status: 500,
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json',
          },
        });
      }
    }

    const datePattern = /^\/(\d{4}-\d{2}-\d{2})$/;
    const dateMatch = path.match(datePattern);

    if (dateMatch) {
      const dateParam = dateMatch[1];
      const { status, body } = await handleCafeteriaRequest(dateParam);

      return new Response(JSON.stringify(body), {
        status,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      });
    }

    if (path === '/') {
      return new Response('api.밥.net', {
        headers: corsHeaders
      });
    }

    return new Response('Not Found', {
      status: 404,
      headers: corsHeaders
    });
  },
});

setupCronJob(5 * 60 * 1000);