export function js2py(val) {
    // substitute JS style booleans
    if (val === true || val === "true") {
        val = "1"
    }
    if (val === false || val === "false") {
        val = "0"
    }
    if (val === null) {
        val = "None"
    }
    // recursively jsonise a dict
    if (val instanceof Object) {
        val = JSON.stringify(val)
    }

    return val
}

export function py2js(val) {
    // substitute JS style booleans
    if (val === "True") {
        val = true
    }
    if (val === "False") {
        val = false
    }
    if (val === "None") {
        val = null
    }
    // handle XML-ised newlines
    if (typeof val === "string") {
        val = val.replaceAll("&#10;", "\n")
    }
    // recursively parse a JSON
    if (String(val).match(/^\{.*\}$|^\[.*\]$/g)) {
        try {
            val = JSON.parse(
                sanitizeJSON(val)
            )
        } catch {
            // leave val as-is if this fails
        }
        
    }

    return val
}

export function sanitizeJSON(val) {
    // make sure val is a string
    val = String(val)
    // sanitize object...
    val = String(val).replaceAll(
        // identify key:value pairs with single quotes
        /'(.*?)': *'(.*?)'/g, 
        (_, key, val) => {
            // escape any double quotes inside the key and value
            key = key.replaceAll(
                /(?<!\\)"/g,
                "\\\""
            )
            val = val.replaceAll(
                /(?<!\\)"/g,
                "\\\""
            )
            // return the key:value pair with double quotes (i.e. JSON friendly)
            return `"${key}": "${val}"`
        }
    )
    // sanitize array...
    if (String(val).match(/^\[.*\]$/s)) {
        val = String(val).replaceAll(
            // identify values with single quotes
            /'(.*?)'/g,
            (_, inner) => {
                // escape any double quotes
                inner = inner.replaceAll(
                    /(?<!\\)"/g,
                    "\\\""
                )
                // wrap in double quotes (i.e. JSON friendly)
                return `"${inner}"`
            }
        )
    }

    return val
}