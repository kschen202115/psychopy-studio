
import { parse } from "svelte/compiler";
import { walk } from 'estree-walker'

const SvelteExtractor = {
  name: "svelte-extractor",
  onLoad: (code, path) => {
    // ignore non-Svelte files
    if (!path.endsWith(".svelte")) {
      return undefined
    }
    // parse file
    let ast = parse(code, {
      filename: path 
    });
    // array in which to store output
    let extracted = [];
    // extract from html
    if (ast.html) {
      walk(ast.html, {
        enter(node, parent, prop, index) {
          // we're only interested in mustage tags
          if (node?.type !== "MustacheTag") {
            return
          }
          // look for calls to i18next.t
          let matches = code.slice(
            node.expression.start, node.expression.end
          ).match(
            /i18next\.t\(.+?\)/g
          )
          // extract thesee
          for (let match of matches || []) {
            extracted.push(match)
          }
        }
      })
    }
    // extract from instance
    if (ast.instance) {
      extracted.push(
        code.slice(
          ast.instance.content.start, ast.instance.content.end
        )
      )
    }
    // extract from module
    if (ast.module) {
      extracted.push(
        code.slice(
          ast.module.content.start, ast.module.content.end
        )
      )
    }

    return extracted.join("\n")
  }
}


/** @type {import('i18next-cli').I18nextToolkitConfig} */
export default {
  locales: [
    "ja_JP",
    // "ar",
    // "cs",
    // "da",
    // "de",
    // "el",
    // "en",
    // "es",
    // "et",
    // "fa",
    // "fi",
    // "fr",
    // "he",
    // "hi",
    // "hu",
    // "it",
    // "ja",
    // "ko",
    // "ms",
    // "nl",
    // "nn",
    // "pl",
    // "pt",
    // "ro",
    // "ru",
    // "sv",
    // "tr",
    // "zh",
  ],
  
  extract: {
    input: ["src/**/*.{svelte,js,svelte.js}"],
    output: "src/lib/translation/locales/{{language}}.json",
    primaryLanguage: "en",
    removeUnusedKeys: false,
    defaultValue: undefined,
  },
  
  plugins: [
    SvelteExtractor
  ]
}