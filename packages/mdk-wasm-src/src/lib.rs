use mdk_core::prelude::*;
use mdk_core::{MdkConfig, MDK};
use mdk_memory_storage::MdkMemoryStorage;
use openmls_traits::OpenMlsProvider;
use serde::{Deserialize, Serialize};
use std::sync::Mutex;
use wasm_bindgen::prelude::*;

type MdkInstance = MDK<MdkMemoryStorage>;

static MDK_INSTANCE: Mutex<Option<MdkInstance>> = Mutex::new(None);

#[wasm_bindgen]
extern "C" {
    #[wasm_bindgen(js_namespace = console)]
    fn log(s: &str);
}

macro_rules! console_log {
    ($($t:tt)*) => (log(&format_args!($($t)*).to_string()))
}

#[derive(Serialize, Deserialize)]
pub struct JsGroupConfig {
    pub name: String,
    pub description: Option<String>,
    pub admins: Vec<String>,
    pub relays: Vec<String>,
}

#[derive(Serialize, Deserialize)]
pub struct JsGroup {
    pub id: String,
    pub name: String,
    pub description: Option<String>,
}

#[derive(Serialize, Deserialize)]
pub struct JsWelcome {
    pub event_id: String,
    pub group_name: String,
    pub group_id: String,
    pub inviter: String,
}

#[derive(Serialize, Deserialize)]
pub struct JsKeyPackage {
    pub event_json: String,
}

#[derive(Serialize, Deserialize)]
pub struct JsCreateGroupResult {
    pub group_id: String,
    pub welcome_event_jsons: Vec<String>,
}

#[derive(Serialize, Deserialize)]
pub struct JsMessageResult {
    pub event_json: String,
}

#[derive(Serialize, Deserialize)]
pub struct JsProcessedMessage {
    pub message_type: String,
    pub content: Option<String>,
    pub sender: Option<String>,
}

#[derive(Serialize, Deserialize)]
pub struct JsUpdateResult {
    pub evolution_event_json: String,
    pub welcome_event_jsons: Vec<String>,
}

#[wasm_bindgen(start)]
pub fn init() {
    console_error_panic_hook::set_once();
    console_log!("MDK WASM initialized");
}

#[wasm_bindgen]
pub fn mdk_init() -> Result<(), JsError> {
    let mut instance = MDK_INSTANCE.lock().map_err(|e| JsError::new(&e.to_string()))?;

    let config = MdkConfig::default();
    let storage = MdkMemoryStorage::default();
    let mdk = MDK::builder(storage).with_config(config).build();

    *instance = Some(mdk);
    console_log!("MDK instance created");
    Ok(())
}

#[wasm_bindgen]
pub fn mdk_init_with_config(
    max_event_age_secs: u64,
    out_of_order_tolerance: u32,
) -> Result<(), JsError> {
    let mut instance = MDK_INSTANCE.lock().map_err(|e| JsError::new(&e.to_string()))?;

    let config = MdkConfig {
        max_event_age_secs,
        out_of_order_tolerance,
        ..Default::default()
    };

    let storage = MdkMemoryStorage::default();
    let mdk = MDK::builder(storage).with_config(config).build();

    *instance = Some(mdk);
    console_log!("MDK instance created with custom config");
    Ok(())
}

fn with_mdk<F, T>(f: F) -> Result<T, JsError>
where
    F: FnOnce(&MdkInstance) -> Result<T, mdk_core::Error>,
{
    let instance = MDK_INSTANCE.lock().map_err(|e| JsError::new(&e.to_string()))?;
    let mdk = instance.as_ref().ok_or_else(|| JsError::new("MDK not initialized. Call mdk_init() first."))?;
    f(mdk).map_err(|e| JsError::new(&e.to_string()))
}

#[wasm_bindgen]
pub fn create_key_package(identity_pubkey: &str, relays_json: &str) -> Result<JsValue, JsError> {
    use nostr::{PublicKey, RelayUrl};

    let pubkey = PublicKey::parse(identity_pubkey)
        .map_err(|e| JsError::new(&format!("Invalid pubkey: {}", e)))?;

    let relay_strings: Vec<String> = serde_json::from_str(relays_json)
        .map_err(|e| JsError::new(&format!("Invalid relays JSON: {}", e)))?;

    let relays: Vec<RelayUrl> = relay_strings.iter()
        .map(|s| RelayUrl::parse(s))
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| JsError::new(&format!("Invalid relay URL: {}", e)))?;

    let result = with_mdk(|mdk| {
        let event = mdk.create_key_package_for_event(&pubkey, relays)?;
        let event_json = serde_json::to_string(&event)
            .map_err(|e| mdk_core::Error::Message(e.to_string()))?;
        Ok(JsKeyPackage { event_json })
    })?;

    serde_wasm_bindgen::to_value(&result).map_err(|e| JsError::new(&e.to_string()))
}

#[wasm_bindgen]
pub fn create_group(
    creator_pubkey: &str,
    key_package_events_json: &str,
    config_json: &str,
) -> Result<JsValue, JsError> {
    use nostr::{Event, PublicKey, RelayUrl};

    let creator = PublicKey::parse(creator_pubkey)
        .map_err(|e| JsError::new(&format!("Invalid creator pubkey: {}", e)))?;

    let key_package_events: Vec<Event> = serde_json::from_str(key_package_events_json)
        .map_err(|e| JsError::new(&format!("Invalid key package events JSON: {}", e)))?;

    let config: JsGroupConfig = serde_json::from_str(config_json)
        .map_err(|e| JsError::new(&format!("Invalid config JSON: {}", e)))?;

    let admins: Vec<PublicKey> = config.admins.iter()
        .map(|s| PublicKey::parse(s))
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| JsError::new(&format!("Invalid admin pubkey: {}", e)))?;

    let relays: Vec<RelayUrl> = config.relays.iter()
        .map(|s| RelayUrl::parse(s))
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| JsError::new(&format!("Invalid relay URL: {}", e)))?;

    let group_config = NostrGroupConfigData::new(
        config.name,
        config.description.unwrap_or_default(),
        None,
        None,
        None,
        relays,
        admins,
    );

    let result = with_mdk(|mdk| {
        let create_result = mdk.create_group(&creator, key_package_events, group_config)?;

        let group_id = hex::encode(create_result.group.mls_group_id.as_slice());

        let welcome_event_jsons: Vec<String> = create_result.welcome_rumors.iter()
            .map(|r| serde_json::to_string(r))
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| mdk_core::Error::Message(e.to_string()))?;

        Ok(JsCreateGroupResult {
            group_id,
            welcome_event_jsons,
        })
    })?;

    serde_wasm_bindgen::to_value(&result).map_err(|e| JsError::new(&e.to_string()))
}

#[wasm_bindgen]
pub fn merge_pending_commit(group_id: &str) -> Result<(), JsError> {
    let group_id_bytes = hex::decode(group_id)
        .map_err(|e| JsError::new(&format!("Invalid group ID: {}", e)))?;
    let group_id = GroupId::from_slice(&group_id_bytes);

    with_mdk(|mdk| mdk.merge_pending_commit(&group_id))
}

#[wasm_bindgen]
pub fn create_message(group_id: &str, content: &str, sender_pubkey: &str) -> Result<JsValue, JsError> {
    use nostr::{EventBuilder, Kind, PublicKey};

    let group_id_bytes = hex::decode(group_id)
        .map_err(|e| JsError::new(&format!("Invalid group ID: {}", e)))?;
    let group_id = GroupId::from_slice(&group_id_bytes);

    let sender = PublicKey::parse(sender_pubkey)
        .map_err(|e| JsError::new(&format!("Invalid sender pubkey: {}", e)))?;

    let rumor = EventBuilder::new(Kind::Custom(1), content)
        .build(sender);

    let result = with_mdk(|mdk| {
        let event = mdk.create_message(&group_id, rumor)?;
        let event_json = serde_json::to_string(&event)
            .map_err(|e| mdk_core::Error::Message(e.to_string()))?;
        Ok(JsMessageResult { event_json })
    })?;

    serde_wasm_bindgen::to_value(&result).map_err(|e| JsError::new(&e.to_string()))
}

#[wasm_bindgen]
pub fn process_message(event_json: &str) -> Result<JsValue, JsError> {
    use nostr::Event;

    let event: Event = serde_json::from_str(event_json)
        .map_err(|e| JsError::new(&format!("Invalid event JSON: {}", e)))?;

    let result = with_mdk(|mdk| {
        let processing_result = mdk.process_message(&event)?;

        match processing_result {
            MessageProcessingResult::ApplicationMessage(msg) => {
                Ok(JsProcessedMessage {
                    message_type: "application".to_string(),
                    content: Some(msg.content),
                    sender: Some(msg.pubkey.to_string()),
                })
            }
            MessageProcessingResult::Commit { mls_group_id } => {
                Ok(JsProcessedMessage {
                    message_type: "commit".to_string(),
                    content: Some(hex::encode(mls_group_id.as_slice())),
                    sender: None,
                })
            }
            MessageProcessingResult::Proposal(_) => {
                Ok(JsProcessedMessage {
                    message_type: "proposal".to_string(),
                    content: None,
                    sender: None,
                })
            }
            MessageProcessingResult::PendingProposal { mls_group_id } => {
                Ok(JsProcessedMessage {
                    message_type: "pending_proposal".to_string(),
                    content: Some(hex::encode(mls_group_id.as_slice())),
                    sender: None,
                })
            }
            MessageProcessingResult::IgnoredProposal { mls_group_id, reason } => {
                Ok(JsProcessedMessage {
                    message_type: "ignored_proposal".to_string(),
                    content: Some(format!("{}: {}", hex::encode(mls_group_id.as_slice()), reason)),
                    sender: None,
                })
            }
            MessageProcessingResult::ExternalJoinProposal { mls_group_id } => {
                Ok(JsProcessedMessage {
                    message_type: "external_join_proposal".to_string(),
                    content: Some(hex::encode(mls_group_id.as_slice())),
                    sender: None,
                })
            }
            MessageProcessingResult::Unprocessable { mls_group_id } => {
                Ok(JsProcessedMessage {
                    message_type: "unprocessable".to_string(),
                    content: Some(hex::encode(mls_group_id.as_slice())),
                    sender: None,
                })
            }
            MessageProcessingResult::PreviouslyFailed => {
                Ok(JsProcessedMessage {
                    message_type: "previously_failed".to_string(),
                    content: None,
                    sender: None,
                })
            }
        }
    })?;

    serde_wasm_bindgen::to_value(&result).map_err(|e| JsError::new(&e.to_string()))
}

#[wasm_bindgen]
pub fn process_welcome(event_id: &str, welcome_rumor_json: &str) -> Result<JsValue, JsError> {
    use nostr::{EventId, UnsignedEvent};

    let event_id = EventId::parse(event_id)
        .map_err(|e| JsError::new(&format!("Invalid event ID: {}", e)))?;

    let rumor: UnsignedEvent = serde_json::from_str(welcome_rumor_json)
        .map_err(|e| JsError::new(&format!("Invalid welcome rumor JSON: {}", e)))?;

    let result = with_mdk(|mdk| {
        let welcome = mdk.process_welcome(&event_id, &rumor)?;

        Ok(JsWelcome {
            event_id: event_id.to_string(),
            group_name: welcome.group_name.clone(),
            group_id: hex::encode(welcome.mls_group_id.as_slice()),
            inviter: welcome.welcomer.to_string(),
        })
    })?;

    serde_wasm_bindgen::to_value(&result).map_err(|e| JsError::new(&e.to_string()))
}

#[wasm_bindgen]
pub fn accept_welcome(event_id: &str) -> Result<(), JsError> {
    use nostr::EventId;
    use mdk_storage_traits::welcomes::WelcomeStorage;

    let event_id = EventId::parse(event_id)
        .map_err(|e| JsError::new(&format!("Invalid event ID: {}", e)))?;

    with_mdk(|mdk| {
        if let Some(welcome) = mdk.get_welcome(&event_id)? {
            return mdk.accept_welcome(&welcome);
        }

        let processed = mdk.provider.storage()
            .find_processed_welcome_by_event_id(&event_id)
            .map_err(|e| mdk_core::Error::Welcome(e.to_string()))?;
        let rumor_event_id = processed
            .and_then(|pw| pw.welcome_event_id)
            .ok_or_else(|| mdk_core::Error::Welcome(format!("Welcome not found: {}", event_id)))?;

        let welcome = mdk.get_welcome(&rumor_event_id)?
            .ok_or_else(|| mdk_core::Error::Welcome(format!("Welcome not found: {}", rumor_event_id)))?;
        mdk.accept_welcome(&welcome)
    })
}

#[wasm_bindgen]
pub fn get_groups() -> Result<JsValue, JsError> {
    let groups = with_mdk(|mdk| {
        let groups = mdk.get_groups()?;
        let js_groups: Vec<JsGroup> = groups.into_iter().map(|g| {
            JsGroup {
                id: hex::encode(g.mls_group_id.as_slice()),
                name: g.name,
                description: if g.description.is_empty() { None } else { Some(g.description) },
            }
        }).collect();
        Ok(js_groups)
    })?;

    serde_wasm_bindgen::to_value(&groups).map_err(|e| JsError::new(&e.to_string()))
}

#[wasm_bindgen]
pub fn get_members(group_id: &str) -> Result<JsValue, JsError> {
    let group_id_bytes = hex::decode(group_id)
        .map_err(|e| JsError::new(&format!("Invalid group ID: {}", e)))?;
    let group_id = GroupId::from_slice(&group_id_bytes);

    let members = with_mdk(|mdk| {
        let members = mdk.get_members(&group_id)?;
        let member_strings: Vec<String> = members.iter().map(|p| p.to_string()).collect();
        Ok(member_strings)
    })?;

    serde_wasm_bindgen::to_value(&members).map_err(|e| JsError::new(&e.to_string()))
}

#[wasm_bindgen]
pub fn add_members(
    group_id: &str,
    key_package_events_json: &str,
) -> Result<JsValue, JsError> {
    use nostr::Event;

    let group_id_bytes = hex::decode(group_id)
        .map_err(|e| JsError::new(&format!("Invalid group ID: {}", e)))?;
    let group_id = GroupId::from_slice(&group_id_bytes);

    let key_package_events: Vec<Event> = serde_json::from_str(key_package_events_json)
        .map_err(|e| JsError::new(&format!("Invalid key package events JSON: {}", e)))?;

    let result = with_mdk(|mdk| {
        let update_result = mdk.add_members(&group_id, &key_package_events)?;

        let evolution_event_json = serde_json::to_string(&update_result.evolution_event)
            .map_err(|e| mdk_core::Error::Message(e.to_string()))?;

        let welcome_event_jsons: Vec<String> = update_result.welcome_rumors
            .unwrap_or_default()
            .iter()
            .map(|r| serde_json::to_string(r))
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| mdk_core::Error::Message(e.to_string()))?;

        Ok(JsUpdateResult {
            evolution_event_json,
            welcome_event_jsons,
        })
    })?;

    serde_wasm_bindgen::to_value(&result).map_err(|e| JsError::new(&e.to_string()))
}

#[wasm_bindgen]
pub fn remove_members(
    group_id: &str,
    member_pubkeys_json: &str,
) -> Result<JsValue, JsError> {
    use nostr::PublicKey;

    let group_id_bytes = hex::decode(group_id)
        .map_err(|e| JsError::new(&format!("Invalid group ID: {}", e)))?;
    let group_id = GroupId::from_slice(&group_id_bytes);

    let member_pubkeys: Vec<String> = serde_json::from_str(member_pubkeys_json)
        .map_err(|e| JsError::new(&format!("Invalid member pubkeys JSON: {}", e)))?;

    let pubkeys: Vec<PublicKey> = member_pubkeys.iter()
        .map(|s| PublicKey::parse(s))
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| JsError::new(&format!("Invalid pubkey: {}", e)))?;

    let result = with_mdk(|mdk| {
        let update_result = mdk.remove_members(&group_id, &pubkeys)?;

        let evolution_event_json = serde_json::to_string(&update_result.evolution_event)
            .map_err(|e| mdk_core::Error::Message(e.to_string()))?;

        Ok(JsUpdateResult {
            evolution_event_json,
            welcome_event_jsons: vec![],
        })
    })?;

    serde_wasm_bindgen::to_value(&result).map_err(|e| JsError::new(&e.to_string()))
}

#[wasm_bindgen]
pub fn leave_group(group_id: &str) -> Result<JsValue, JsError> {
    let group_id_bytes = hex::decode(group_id)
        .map_err(|e| JsError::new(&format!("Invalid group ID: {}", e)))?;
    let group_id = GroupId::from_slice(&group_id_bytes);

    let result = with_mdk(|mdk| {
        let update_result = mdk.leave_group(&group_id)?;

        let evolution_event_json = serde_json::to_string(&update_result.evolution_event)
            .map_err(|e| mdk_core::Error::Message(e.to_string()))?;

        Ok(JsUpdateResult {
            evolution_event_json,
            welcome_event_jsons: vec![],
        })
    })?;

    serde_wasm_bindgen::to_value(&result).map_err(|e| JsError::new(&e.to_string()))
}

#[wasm_bindgen]
pub fn export_mdk_state() -> Result<Vec<u8>, JsError> {
    let instance = MDK_INSTANCE.lock().map_err(|e| JsError::new(&e.to_string()))?;
    let mdk = instance
        .as_ref()
        .ok_or_else(|| JsError::new("MDK not initialized"))?;
    let snapshot = mdk.provider.storage().create_snapshot();
    postcard::to_allocvec(&snapshot)
        .map_err(|e| JsError::new(&format!("Serialization failed: {}", e)))
}

#[wasm_bindgen]
pub fn import_mdk_state(data: &[u8]) -> Result<(), JsError> {
    let instance = MDK_INSTANCE.lock().map_err(|e| JsError::new(&e.to_string()))?;
    let mdk = instance
        .as_ref()
        .ok_or_else(|| JsError::new("MDK not initialized"))?;
    let snapshot: mdk_memory_storage::MemoryStorageSnapshot = postcard::from_bytes(data)
        .map_err(|e| JsError::new(&format!("Deserialization failed: {}", e)))?;
    mdk.provider.storage().restore_snapshot(snapshot);
    Ok(())
}
