import { Elysia } from 'elysia'
import { swagger } from '@elysiajs/swagger'

import { rateLimit } from '../src'

const app = new Elysia()
  .use(swagger())
  .use(rateLimit())
  .get('/', (ctx) => `hello, ${ctx.ip} (${typeof ctx.ip})!`)
  .listen(3000, () => {
    console.log('🦊 Swagger is active at: http://localhost:3000/swagger')
  })
