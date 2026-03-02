export interface JsKeyPackage {
  event_json: string;
}

export interface JsCreateGroupResult {
  group_id: string;
  welcome_event_jsons: string[];
}

export interface JsGroup {
  id: string;
  name: string;
  description?: string;
}

export interface JsUpdateResult {
  evolution_event_json: string;
  welcome_event_jsons: string[];
}

export interface JsMessageResult {
  event_json: string;
}

export interface JsProcessedMessage {
  message_type: string;
  content?: string;
  sender?: string;
}

export interface JsWelcome {
  event_id: string;
  group_name: string;
  group_id: string;
  inviter: string;
}

export interface GroupConfig {
  name: string;
  description: string;
  relays: string[];
  admins: string[];
}
