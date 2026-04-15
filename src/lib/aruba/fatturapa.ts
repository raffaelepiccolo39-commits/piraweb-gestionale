/**
 * FatturaPA XML Generator
 *
 * Generates XML in FatturaPA 1.2.2 format for Italian electronic invoicing.
 * Reference: https://www.fatturapa.gov.it/it/norme-e-regole/documentazione-fattura-elettronica/
 */

export interface FatturapaData {
  // Cedente/Prestatore (seller = PiraWeb)
  seller: {
    denominazione: string;       // "Pira Web S.R.L."
    partita_iva: string;         // "04891370613"
    codice_fiscale: string;      // "04891370613"
    regime_fiscale: string;      // "RF01" (ordinario)
    indirizzo: string;
    cap: string;
    comune: string;
    provincia: string;
    nazione: string;             // "IT"
  };
  // Cessionario/Committente (buyer = client)
  buyer: {
    denominazione: string;
    partita_iva: string | null;
    codice_fiscale: string | null;
    codice_sdi: string | null;   // Codice destinatario SDI (7 chars) or "0000000"
    pec: string | null;
    indirizzo: string | null;
    cap: string | null;
    comune: string | null;
    provincia: string | null;
    nazione: string;
  };
  // Document
  invoice_number: string;        // e.g. "FT-2026-001"
  issue_date: string;            // "2026-04-15"
  due_date: string;
  description: string | null;
  // Line items
  items: {
    descrizione: string;
    quantita: number;
    prezzo_unitario: number;
    prezzo_totale: number;
    aliquota_iva: number;        // 22
  }[];
  // Totals
  imponibile: number;
  aliquota_iva: number;
  imposta: number;
  totale: number;
  // Payment
  payment_method?: string;       // "MP05" = bonifico
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function formatNumber(n: number, decimals = 2): string {
  return n.toFixed(decimals);
}

function formatDate(dateStr: string): string {
  // Ensure YYYY-MM-DD format
  return dateStr.split('T')[0];
}

/**
 * Generate a progressive file ID for the FatturaPA filename.
 * Format: IT<partita_iva>_<5_char_id>
 */
export function generateFatturapaFilename(
  partitaIvaSender: string,
  progressiveId: string,
): string {
  // Pad to 5 chars
  const id = progressiveId.padStart(5, '0').slice(-5);
  return `IT${partitaIvaSender}_${id}`;
}

/**
 * Generate FatturaPA XML string.
 */
export function generateFatturapaXml(data: FatturapaData): string {
  const codiceDestinatario = data.buyer.codice_sdi || '0000000';
  const pecDestinatario = !data.buyer.codice_sdi || data.buyer.codice_sdi === '0000000'
    ? data.buyer.pec || ''
    : '';

  const lines = data.items.map((item, i) => `
        <DettaglioLinee>
          <NumeroLinea>${i + 1}</NumeroLinea>
          <Descrizione>${escapeXml(item.descrizione)}</Descrizione>
          <Quantita>${formatNumber(item.quantita)}</Quantita>
          <PrezzoUnitario>${formatNumber(item.prezzo_unitario)}</PrezzoUnitario>
          <PrezzoTotale>${formatNumber(item.prezzo_totale)}</PrezzoTotale>
          <AliquotaIVA>${formatNumber(item.aliquota_iva)}</AliquotaIVA>
        </DettaglioLinee>`).join('');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<p:FatturaElettronica versione="FPR12" xmlns:ds="http://www.w3.org/2000/09/xmldsig#" xmlns:p="http://ivaservizi.agenziaentrate.gov.it/docs/xsd/fatture/v1.2" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://ivaservizi.agenziaentrate.gov.it/docs/xsd/fatture/v1.2 http://www.fatturapa.gov.it/export/fatturazione/sdi/fatturapa/v1.2.2/Schema_del_file_xml_FatturaPA_v1.2.2.xsd">
  <FatturaElettronicaHeader>
    <DatiTrasmissione>
      <IdTrasmittente>
        <IdPaese>IT</IdPaese>
        <IdCodice>${escapeXml(data.seller.partita_iva)}</IdCodice>
      </IdTrasmittente>
      <ProgressivoInvio>${escapeXml(data.invoice_number.replace(/[^a-zA-Z0-9]/g, ''))}</ProgressivoInvio>
      <FormatoTrasmissione>FPR12</FormatoTrasmissione>
      <CodiceDestinatario>${escapeXml(codiceDestinatario)}</CodiceDestinatario>${pecDestinatario ? `
      <PECDestinatario>${escapeXml(pecDestinatario)}</PECDestinatario>` : ''}
    </DatiTrasmissione>
    <CedentePrestatore>
      <DatiAnagrafici>
        <IdFiscaleIVA>
          <IdPaese>IT</IdPaese>
          <IdCodice>${escapeXml(data.seller.partita_iva)}</IdCodice>
        </IdFiscaleIVA>
        <CodiceFiscale>${escapeXml(data.seller.codice_fiscale)}</CodiceFiscale>
        <Anagrafica>
          <Denominazione>${escapeXml(data.seller.denominazione)}</Denominazione>
        </Anagrafica>
        <RegimeFiscale>${escapeXml(data.seller.regime_fiscale)}</RegimeFiscale>
      </DatiAnagrafici>
      <Sede>
        <Indirizzo>${escapeXml(data.seller.indirizzo)}</Indirizzo>
        <CAP>${escapeXml(data.seller.cap)}</CAP>
        <Comune>${escapeXml(data.seller.comune)}</Comune>
        <Provincia>${escapeXml(data.seller.provincia)}</Provincia>
        <Nazione>${escapeXml(data.seller.nazione)}</Nazione>
      </Sede>
    </CedentePrestatore>
    <CessionarioCommittente>
      <DatiAnagrafici>${data.buyer.partita_iva ? `
        <IdFiscaleIVA>
          <IdPaese>${escapeXml(data.buyer.nazione)}</IdPaese>
          <IdCodice>${escapeXml(data.buyer.partita_iva)}</IdCodice>
        </IdFiscaleIVA>` : ''}${data.buyer.codice_fiscale ? `
        <CodiceFiscale>${escapeXml(data.buyer.codice_fiscale)}</CodiceFiscale>` : ''}
        <Anagrafica>
          <Denominazione>${escapeXml(data.buyer.denominazione)}</Denominazione>
        </Anagrafica>
      </DatiAnagrafici>
      <Sede>
        <Indirizzo>${escapeXml(data.buyer.indirizzo || 'N/A')}</Indirizzo>
        <CAP>${escapeXml(data.buyer.cap || '00000')}</CAP>
        <Comune>${escapeXml(data.buyer.comune || 'N/A')}</Comune>${data.buyer.provincia ? `
        <Provincia>${escapeXml(data.buyer.provincia)}</Provincia>` : ''}
        <Nazione>${escapeXml(data.buyer.nazione)}</Nazione>
      </Sede>
    </CessionarioCommittente>
  </FatturaElettronicaHeader>
  <FatturaElettronicaBody>
    <DatiGenerali>
      <DatiGeneraliDocumento>
        <TipoDocumento>TD01</TipoDocumento>
        <Divisa>EUR</Divisa>
        <Data>${formatDate(data.issue_date)}</Data>
        <Numero>${escapeXml(data.invoice_number)}</Numero>${data.description ? `
        <Causale>${escapeXml(data.description)}</Causale>` : ''}
      </DatiGeneraliDocumento>
    </DatiGenerali>
    <DatiBeniServizi>${lines}
      <DatiRiepilogo>
        <AliquotaIVA>${formatNumber(data.aliquota_iva)}</AliquotaIVA>
        <ImponibileImporto>${formatNumber(data.imponibile)}</ImponibileImporto>
        <Imposta>${formatNumber(data.imposta)}</Imposta>
        <EsigibilitaIVA>I</EsigibilitaIVA>
      </DatiRiepilogo>
    </DatiBeniServizi>
    <DatiPagamento>
      <CondizioniPagamento>TP02</CondizioniPagamento>
      <DettaglioPagamento>
        <ModalitaPagamento>${escapeXml(data.payment_method || 'MP05')}</ModalitaPagamento>
        <DataScadenzaPagamento>${formatDate(data.due_date)}</DataScadenzaPagamento>
        <ImportoPagamento>${formatNumber(data.totale)}</ImportoPagamento>
      </DettaglioPagamento>
    </DatiPagamento>
  </FatturaElettronicaBody>
</p:FatturaElettronica>`;

  return xml;
}
