import Elysia from 'elysia'
import { defaultOptions } from '../constants/defaultOptions'
import { DefaultContext } from './defaultContext'
import { logger } from './logger'
import type { Options } from '../@types/Options'
import { getIP } from './getip'
import debug from 'debug'

export const plugin = (userOptions?: Partial<Options>) => {
  const options: Options = {
    ...defaultOptions,
    ...userOptions,
    context: userOptions?.context ?? new DefaultContext(),
  }

  options.context.init(options)

  // NOTE:
  // do not make plugin to return async
  // otherwise request will be triggered twice
  return (app: Elysia) => {
    return app.use(new Elysia({
      name: "elysia-rate-limit"
    })
      .derive({ as: "global" }, ({ request }): { ip: string } => {
        serverIP: {
          if (globalThis.Bun) {
            const server = app.server;
            if (!server) {
              debug(
                "plugin: Elysia server is not initialized. Make sure to call Elyisa.listen()",
              );
              debug("plugin: use injectServer to inject Server instance");
              break serverIP;
            }

            if (!server.requestIP) {
              debug("plugin: server.requestIP is null");
              debug("plugin: Please check server instace");
              break serverIP;
            }

            const socketAddress = server.requestIP(request);
            debug(`plugin: socketAddress ${JSON.stringify(socketAddress)}`);
            if (!socketAddress) {
              debug("plugin: ip from server.requestIP return `null`");
              break serverIP;
            }
            return { ip: socketAddress.address };
          }
        }

        return { ip: getIP(request.headers) ?? "" }
      })
      .onBeforeHandle({ as: options.scoping }, async (ctx) => {
        let clientKey: string | undefined

        /**
         * if a skip option has two parameters,
         * then we will generate clientKey ahead of time.
         * this is made to skip generating key unnecessary if only check for request
         * and saving some cpu consumption when actually skipped
         */
        if (options.skip.length >= 2)
          clientKey = ctx.ip ?? undefined

        // if decided to skip, then do nothing and let the app continue
        if (await options.skip(ctx.request, clientKey) === false) {
          /**
           * if a skip option has less than two parameters,
           * that's mean clientKey does not have a key yet
           * then generate one
           */
          if (options.skip.length < 2)
            clientKey = ctx.ip ?? undefined

          const { count, nextReset } = await options.context.increment(clientKey!)

          const payload = {
            limit: options.max,
            current: count,
            remaining: Math.max(options.max - count, 0),
            nextReset,
          }

          // set standard headers
          const reset = Math.max(0, Math.ceil((nextReset.getTime() - Date.now()) / 1000))

          let builtHeaders: Record<string, string> = {
            'RateLimit-Limit': String(options.max),
            'RateLimit-Remaining': String(payload.remaining),
            'RateLimit-Reset': String(reset),
          }

          // reject if limit were reached
          if (payload.current >= payload.limit + 1) {
            logger('plugin', 'rate limit exceeded for clientKey: %s (resetting in %d seconds)', clientKey, reset)

            builtHeaders['Retry-After'] = String(Math.ceil(options.duration / 1000))

            if (options.errorResponse instanceof Error)
              throw options.errorResponse
            else if (options.errorResponse instanceof Response) {
              // duplicate the response to avoid mutation
              const clonedResponse = options.errorResponse.clone()

              // append headers
              if (options.headers)
                for (const [key, value] of Object.entries(builtHeaders))
                  clonedResponse.headers.set(key, value)

              return clonedResponse
            }
            else {
              // append headers
              if (options.headers)
                for (const [key, value] of Object.entries(builtHeaders))
                  ctx.set.headers[key] = value

              // set default status code
              ctx.set.status = 429

              return options.errorResponse
            }
          }

          // append headers
          if (options.headers)
            for (const [key, value] of Object.entries(builtHeaders))
              ctx.set.headers[key] = value

          logger('plugin', 'clientKey %s passed through with %d/%d request used (resetting in %d seconds)', clientKey, options.max - payload.remaining, options.max, reset)
        }
      })
      // @ts-expect-error somehow qi is being sent from elysia, but there's no type declaration for it
      .onError({ as: options.scoping }, async ({ set, request, query, path, store, cookie, error, body, params, headers, qi, code, ...rest }) => {

        if (!options.countFailedRequest) {
          const clientKey = await options.generator(request, options.injectServer?.(app) ?? app.server, rest)

          logger('plugin', 'request failed for clientKey: %s, refunding', clientKey)
          await options.context.decrement(clientKey)
        }
      })
      .onStop(async () => {
        logger('plugin', 'kill signal received')
        await options.context.kill()
      }))
  }
}
