import i18next from "i18next";
import { prefs } from "$lib/preferences.svelte";
import { universalLanguageDetect } from '@unly/universal-language-detector';
// locales
import ar_001 from "./locales/ar_001.json";
import cs_CZ from "./locales/cs_CZ.json";
import da_DK from "./locales/da_DK.json";
import de_DE from "./locales/de_DE.json";
import el_GR from "./locales/el_GR.json";
import en_NZ from "./locales/en_NZ.json";
import en_US from "./locales/en_US.json";
import es_CO from "./locales/es_CO.json";
import es_ES from "./locales/es_ES.json";
import es_US from "./locales/es_US.json";
import et_EE from "./locales/et_EE.json";
import fa_IR from "./locales/fa_IR.json";
import fi_FI from "./locales/fi_FI.json";
import fr_FR from "./locales/fr_FR.json";
import he_IL from "./locales/he_IL.json";
import hi_IN from "./locales/hi_IN.json";
import hu_HU from "./locales/hu_HU.json";
import it_IT from "./locales/it_IT.json";
import ja_JP from "./locales/ja_JP.json";
import ko_KR from "./locales/ko_KR.json";
import ms_MY from "./locales/ms_MY.json";
import nl_NL from "./locales/nl_NL.json";
import nn_NO from "./locales/nn_NO.json";
import pl_PL from "./locales/pl_PL.json";
import pt_PT from "./locales/pt_PT.json";
import ro_RO from "./locales/ro_RO.json";
import ru_RU from "./locales/ru_RU.json";
import sv_SE from "./locales/sv_SE.json";
import tr_TR from "./locales/tr_TR.json";
import zh_CN from "./locales/zh_CN.json";
import zh_TW from "./locales/zh_TW.json";


// initialise i18next with locales
i18next.init({
    debug: true,
    returnEmptyString: false,
    resources: {
        ar_001: ar_001,
        cs_CZ: cs_CZ,
        da_DK: da_DK,
        de_DE: de_DE,
        el_GR: el_GR,
        en_NZ: en_NZ,
        en_US: en_US,
        es_CO: es_CO,
        es_ES: es_ES,
        es_US: es_US,
        et_EE: et_EE,
        fa_IR: fa_IR,
        fi_FI: fi_FI,
        fr_FR: fr_FR,
        he_IL: he_IL,
        hi_IN: hi_IN,
        hu_HU: hu_HU,
        it_IT: it_IT,
        ja_JP: ja_JP,
        ko_KR: ko_KR,
        ms_MY: ms_MY,
        nl_NL: nl_NL,
        nn_NO: nn_NO,
        pl_PL: pl_PL,
        pt_PT: pt_PT,
        ro_RO: ro_RO,
        ru_RU: ru_RU,
        sv_SE: sv_SE,
        tr_TR: tr_TR,
        zh_CN: zh_CN,
        zh_TW: zh_TW,
    }
});



// export translate function
export const translate = i18next.t;
// export available localtes
export const locales = Object.keys(i18next.toJSON().store.data)
// export functions to get/set locale
export const setLocale = i18next.setLocale
export const getLocale = i18next.getLocale
// export effect to update from prefs (needs to be mounted to root element)
export function updateLocale() {
    // get locale from prefs
    let locale = prefs.params['locale']?.val
    // if default, get system locale
    if (!locale || locale === "system locale") {
        locale = universalLanguageDetect({
            supportedLanguages: locales,
            fallbackLanguage: "en_US"
        })
    }
    i18next.changeLanguage(locale)
}