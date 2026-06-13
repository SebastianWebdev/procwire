/**
 * Apache Arrow codec — opt-in subpath export (`@procwire/codecs/arrow`).
 *
 * Arrow is reachable ONLY through this subpath, never from the package root.
 * `apache-arrow` is an OPTIONAL peer dependency: it is not installed by
 * `@procwire/codecs` itself, so raw/msgpack-only consumers stay free of Arrow's
 * multi-MB footprint. Install `apache-arrow` to use this module:
 *
 * ```bash
 * npm install @procwire/codecs apache-arrow
 * ```
 *
 * ```typescript
 * import { arrowCodec } from "@procwire/codecs/arrow";
 * ```
 *
 * @module @procwire/codecs/arrow
 */

export {
  ArrowCodec,
  arrowCodec,
  type ArrowSerializable,
  type ArrowObjectInput,
} from "./arrow-codec.js";
