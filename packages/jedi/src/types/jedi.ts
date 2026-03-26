// Segment primitives — reusable across transaction sets

export interface ST_Header {
  ST_01_TransactionSetIdentifierCode: string;
  ST_02_TransactionSetControlNumber: string;
}

export interface SE_Trailer {
  SE_01_NumberOfIncludedSegments: string;
  SE_02_TransactionSetControlNumber: string;
}

export interface N1_Loop {
  name_N1: {
    N1_01_EntityIdentifierCode: string;
    N1_02_Name?: string;
    N1_03_IdentificationCodeQualifier?: string;
    N1_04_IdentificationCode?: string;
  };
  address_information_N3?: {
    N3_01_AddressInformation: string;
    N3_02_AddressInformation?: string;
  };
  geographic_location_N4?: {
    N4_01_CityName?: string;
    N4_02_StateOrProvinceCode?: string;
    N4_03_PostalCode?: string;
  };
}

export interface L11_Reference {
  L11_01_ReferenceIdentification: string;
  L11_02_ReferenceIdentificationQualifier: string;
}

export interface G62_DateTime {
  G62_01_DateQualifier?: string;
  G62_02_Date?: string;
  G62_03_TimeQualifier?: string;
  G62_04_Time?: string;
}

// Jedi204 — Motor Carrier Load Tender

export interface Jedi204 {
  heading: {
    transaction_set_header_ST: ST_Header;
    beginning_segment_for_shipper_order_B2: {
      B2_02_StandardCarrierAlphaCode?: string;
      B2_04_ShipmentIdentificationNumber?: string;
      B2_06_ShipmentMethodOfPayment?: string;
    };
    reference_identification_L11?: L11_Reference[];
    date_time_reference_G62?: G62_DateTime[];
    party_identification_loop_N1?: N1_Loop[];
  };
  detail: {
    stop_off_details_loop_S5: Array<{
      stop_off_details_S5: {
        S5_01_StopSequenceNumber: string;
        S5_02_StopReasonCode: string;
      };
      reference_identification_L11?: L11_Reference[];
      date_time_reference_G62?: G62_DateTime[];
      party_identification_loop_N1?: N1_Loop[];
    }>;
  };
  summary?: {
    transaction_set_trailer_SE: SE_Trailer;
  };
}

// Jedi997 — Functional Acknowledgment

export interface Jedi997 {
  heading: {
    transaction_set_header_ST: ST_Header;
    functional_group_response_header_AK1: {
      AK1_01_FunctionalIdentifierCode: string;
      AK1_02_GroupControlNumber: string;
    };
    transaction_set_response_loop_AK2?: Array<{
      transaction_set_response_header_AK2: {
        AK2_01_TransactionSetIdentifierCode: string;
        AK2_02_TransactionSetControlNumber: string;
      };
      transaction_set_response_trailer_AK5: {
        AK5_01_TransactionSetAcknowledgmentCode: string;
        AK5_02_ImplementationTransactionSetSyntaxErrorCode?: string;
      };
    }>;
    functional_group_response_trailer_AK9: {
      AK9_01_FunctionalGroupAcknowledgeCode: string;
      AK9_02_NumberOfTransactionSetsIncluded: string;
      AK9_03_NumberOfReceivedTransactionSets: string;
      AK9_04_NumberOfAcceptedTransactionSets: string;
    };
    transaction_set_trailer_SE: SE_Trailer;
  };
}

// Envelope wrappers

export interface JediFunctionalGroup {
  GS_02_ApplicationSenderCode: string;
  GS_03_ApplicationReceiverCode: string;
  GS_04_Date?: string;
  GS_05_Time?: string;
  GS_06_GroupControlNumber: string;
  transaction_sets: Array<Jedi204 | Jedi997>;
}

export interface JediInterchangeEnvelope {
  ISA_01_AuthorizationInformationQualifier: string;
  ISA_02_AuthorizationInformation: string;
  ISA_06_InterchangeSenderId: string;
  ISA_08_InterchangeReceiverId: string;
  ISA_13_InterchangeControlNumber: string;
  ISA_14_AcknowledgmentRequested?: string;
  ISA_15_InterchangeUsageIndicator?: string;
  functional_groups: JediFunctionalGroup[];
}

export interface JediDocument {
  interchanges: JediInterchangeEnvelope[];
}
