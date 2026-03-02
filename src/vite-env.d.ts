/// <reference types="vite/client" />

declare module '*.vue' {
  import type { DefineComponent } from 'vue';
  const component: DefineComponent<object, object, unknown>;
  export default component;
}

declare module 'mdk-wasm' {
  export function mdk_init(): void;
  export function mdk_init_with_config(
    max_event_age_secs: bigint,
    out_of_order_tolerance: number
  ): void;
  export function init(): void;
  export function accept_welcome(event_id: string): void;
  export function add_members(
    group_id: string,
    key_package_events_json: string
  ): unknown;
  export function create_group(
    creator_pubkey: string,
    key_package_events_json: string,
    config_json: string
  ): unknown;
  export function create_key_package(
    identity_pubkey: string,
    relays_json: string
  ): unknown;
  export function create_message(
    group_id: string,
    content: string,
    sender_pubkey: string
  ): unknown;
  export function get_groups(): unknown;
  export function get_members(group_id: string): unknown;
  export function leave_group(group_id: string): unknown;
  export function merge_pending_commit(group_id: string): void;
  export function process_message(event_json: string): unknown;
  export function process_welcome(
    event_id: string,
    welcome_rumor_json: string
  ): unknown;
  export function remove_members(
    group_id: string,
    member_pubkeys_json: string
  ): unknown;
  export function export_mdk_state(): Uint8Array;
  export function import_mdk_state(data: Uint8Array): void;
}
