import { electron } from "$lib/globals.svelte";

export { default as Menu } from "./Menu.svelte";
export { default as MenuItem } from "./Item.svelte";
export { default as MenuSeparator } from "./Separator.svelte";
export { default as SubMenu } from "./SubMenu.svelte";

async function _checkIsHamburger() {
    if (electron) {
        // in app, use a hamburger on Windows and Linux
        return await electron.platform() !== "darwin"
    } else {
        // in browser, always use hamburger
        return true
    }
}

export var isHamburger = _checkIsHamburger()
