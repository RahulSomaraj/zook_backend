export interface JeeblyCreateShipmentRequest {
  delivery_type: 'Next Day';
  load_type: 'Non-document';
  consignment_type: 'Forward';
  description: string;
  weight: number;
  payment_type: 'Prepaid' | 'COD';
  cod_amount: number;
  num_pieces: 1;
  customer_reference_number: string;
  origin_address_name: string;
  origin_address_mob_no_country_code: string;
  origin_address_mobile_number: string;
  origin_address_house_no: string;
  origin_address_building_name: string;
  origin_address_area: string;
  origin_address_landmark: string;
  origin_address_city: string;
  origin_address_type: 'Normal';
  destination_address_name: string;
  destination_address_mob_no_country_code: string;
  destination_address_mobile_number: string;
  destination_address_house_no: string;
  destination_address_building_name: string;
  destination_address_area: string;
  destination_address_landmark: string;
  destination_address_city: string;
  destination_address_type: 'Normal';
  pickup_date: string;
}

export interface JeeblyShipment {
  awbNumber: string;
  message: string;
}

/** Label formats Jeebly may return from `generate_shipment_label`. */
export type JeeblyLabelContentType =
  | 'application/pdf'
  | 'image/png'
  | 'image/jpeg';

/** A printable shipping label, held as the raw bytes Jeebly returned. */
export interface JeeblyShipmentLabel {
  /** Raw label bytes exactly as Jeebly returned them. Never logged. */
  data: Buffer;
  contentType: JeeblyLabelContentType;
  /** File extension matching `contentType`, without the dot. */
  extension: 'pdf' | 'png' | 'jpg';
}

/** One tracking event. Provider text is trimmed and length-capped. */
export interface JeeblyTrackingEvent {
  /** Jeebly's status text normalised to snake_case, e.g. `out_for_delivery`. */
  status: string;
  /** The status text exactly as Jeebly displays it, e.g. "Out For Delivery". */
  label: string;
  description: string | null;
  hubName: string | null;
  /** ISO 8601 UTC. Null when Jeebly's timestamp could not be parsed. */
  occurredAt: string | null;
  riderName: string | null;
  failureReason: string | null;
  /** Proof-of-delivery photo and signature; absolute https URLs only. */
  proofOfDeliveryUrl: string | null;
  signatureUrl: string | null;
}

/** Current status and event history of a shipment from `track_shipment`. */
export interface JeeblyShipmentTracking {
  /** `reference_no`: the AWB as Jeebly spells it. */
  awbNumber: string;
  /** Our `customer_reference_number`, when Jeebly echoes it. */
  customerReference: string | null;
  /** `last_status` normalised to snake_case, e.g. `delivered`. */
  lastStatus: string;
  /** Calendar dates as `YYYY-MM-DD`; time as `HH:mm`. Null when absent. */
  pickupDate: string | null;
  bookingDate: string | null;
  bookingTime: string | null;
  /** Most recent first, as Jeebly returns them. */
  events: JeeblyTrackingEvent[];
}

export interface JeeblyShipmentCancellation {
  awbNumber: string;
  alreadyCancelled: boolean;
}
