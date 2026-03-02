/* @ts-self-types="./mdk_wasm.d.ts" */

import * as wasm from "./mdk_wasm_bg.wasm";
import { __wbg_set_wasm } from "./mdk_wasm_bg.js";
__wbg_set_wasm(wasm);
wasm.__wbindgen_start();
export {
    accept_welcome, add_members, create_group, create_key_package, create_message, export_mdk_state, get_groups, get_members, import_mdk_state, init, leave_group, mdk_init, mdk_init_with_config, merge_pending_commit, process_message, process_welcome, remove_members
} from "./mdk_wasm_bg.js";
