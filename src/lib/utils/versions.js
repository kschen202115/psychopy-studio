export class Version {
    // regex for a valid version
    static pattern = /(?<major>\d+)\.(?<minor>\d+)(?:\.(?<patch>(?:\d+|\*))(?<extra>[\d\w]+)?)?/

    constructor(version) {
        // parse with regex
        let parts = version.match(Version.pattern).groups
        // store parts (as int, if relevant)
        this.major = parseInt(parts.major)
        this.minor = parseInt(parts.minor)
        this.patch = parts.patch === "*" ? Infinity : parseInt(parts.patch)
        this.extra = parts.extra
    }

    /**
     * Parse a string into a Version object
     * 
     * @param {string|Version} version String to parse; if given a Version, will return it unchanged
     * 
     * @returns {Version}
     */
    static parse(version) {
        // if given a Version, return it unchanged
        if (version instanceof Version) {
            return version
        }
        // create new Version from string
        return new Version(version)
    }

    /**
     * Format this version to a string
     * 
     * @param {string} upto How much of the version to include, options are:
     *   - "major": Include only the major version (2025.1.1beta -> 2025)
     *   - "major": Include up to the minor version (2025.1.1beta -> 2025.1)
     *   - "patch": Include up to the patch version (2025.1.1beta -> 2025.1.1)
     *   - "extra": Include up to the extra version, i.e. everything (2025.1.1beta -> 2025.1.1beta)
     */
    format(upto="extra") {
        let output = ""
        // add major
        output += `${this.major}`
        if (upto === "major") {
            return output
        }
        // add minor
        output += `.${this.minor || ""}`
        if (upto === "minor") {
            return output
        }
        // add patch
        if (this.patch === Infinity) {
            output += ".*"
        } else {
            output += `.${this.patch || ""}`
        }
        if (upto === "patch") {
            return output
        }
        // add extra
        output += `${this.extra || ""}`

        return output
    }

    /**
     * Returns true if the given version is the same as this one.
     * 
     * @param {Version|string} other Version to compare against
     */
    equal(other) {
        // if given a string, parse it to another Version object
        if (typeof other === "string") {
            other = Version.parse(string)
        }

        return (
            this.major === other.major &
            this.minor === other.minor &
            this.patch === other.patch &
            this.extra === other.extra
        )
    }

    /**
     * Returns true if the given version is newer than this one.
     * 
     * @param {Version|string} other Version to compare against
     */
    newer(other) {
        // if given a string, parse it to another Version object
        if (typeof other === "string") {
            other = Version.parse(string)
        }
        // compare major
        if (other.major > this.major) {
            return true
        }
        if (other.major < this.major) {
            return false
        }
        // if major is the same, compare minor
        if ((other.minor || 0) > this.minor) {
            return true
        }
        if ((other.minor || 0) < this.minor) {
            return false
        }
        // if minor is the same, compare patch
        if ((other.patch || 0) > this.patch) {
            return true
        }
        if ((other.patch || 0) < this.patch) {
            return false
        }
        // if other has extra and this doesn't, it's newer
        if (other.extra & !this.extra) {
            return true
        }

        return false
    }

    /**
     * Returns true if the given version is older than this one.
     * 
     * @param {Version|string} other Version to compare against
     */
    older(other) {
        // if given a string, parse it to another Version object
        if (typeof other === "string") {
            other = Version.parse(string)
        }
        // compare major
        if (other.major < this.major) {
            return true
        }
        if (other.major > this.major) {
            return false
        }
        // if major is the same, compare minor
        if ((other.minor || 0) < this.minor) {
            return true
        }
        if ((other.minor || 0) > this.minor) {
            return false
        }
        // if minor is the same, compare patch
        if ((other.patch || 0) < this.patch) {
            return true
        }
        if ((other.patch || 0) > this.patch) {
            return false
        }
        // if other doesn't have extra and this does, it's older
        if (!other.extra & this.extra) {
            return false
        }

        return false
    }
}