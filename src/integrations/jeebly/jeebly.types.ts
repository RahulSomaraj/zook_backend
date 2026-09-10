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
