/**
 * Configurazione per il team di agenti lead generation.
 * Ricerca locale: parte da Casapesenna e si espande a cerchi concentrici
 * fino a coprire tutta Italia.
 * Una ricerca al giorno, zona per zona.
 */

// Zone ordinate per vicinanza a Casapesenna -> tutta Italia
export const ZONE_RICERCA = [
  // ═══ CAMPANIA - Zona Casa ═══
  { nome: 'Casapesenna e limitrofi', comuni: ['Casapesenna', 'Casal di Principe', 'San Cipriano d\'Aversa', 'Villa di Briano', 'Frignano'] },
  { nome: 'Agro Aversano', comuni: ['Villa Literno', 'Teverola', 'Lusciano', 'Parete', 'San Marcellino'] },
  { nome: 'Aversa e dintorni', comuni: ['Aversa', 'Gricignano di Aversa', 'Cesa', 'Succivo', 'Sant\'Arpino'] },
  { nome: 'Area Giugliano', comuni: ['Giugliano in Campania', 'Qualiano', 'Villaricca', 'Calvizzano', 'Marano di Napoli'] },
  { nome: 'Caserta citta\'', comuni: ['Caserta', 'San Nicola la Strada', 'Maddaloni', 'Casagiove', 'Marcianise'] },
  { nome: 'Nord Caserta', comuni: ['Santa Maria Capua Vetere', 'Capua', 'San Prisco', 'Macerata Campania', 'Portico di Caserta'] },
  { nome: 'Litorale Domizio', comuni: ['Mondragone', 'Sessa Aurunca', 'Cellole', 'Castel Volturno', 'Cancello ed Arnone'] },
  { nome: 'Napoli centro', comuni: ['Napoli'] },
  { nome: 'Napoli nord', comuni: ['Afragola', 'Casoria', 'Arzano', 'Casavatore', 'Cardito'] },
  { nome: 'Area Flegrea', comuni: ['Pozzuoli', 'Bacoli', 'Monte di Procida', 'Quarto', 'Ischia'] },
  { nome: 'Area Nolana-Vesuviana', comuni: ['Nola', 'Marigliano', 'Acerra', 'Pomigliano d\'Arco', 'Somma Vesuviana'] },
  { nome: 'Area Stabiese-Sorrentina', comuni: ['Castellammare di Stabia', 'Torre Annunziata', 'Torre del Greco', 'Sorrento', 'Pompei'] },
  { nome: 'Salerno citta\'', comuni: ['Salerno', 'Cava de\' Tirreni', 'Nocera Inferiore', 'Nocera Superiore', 'Pagani'] },
  { nome: 'Piana del Sele', comuni: ['Battipaglia', 'Eboli', 'Pontecagnano', 'Bellizzi', 'Campagna'] },
  { nome: 'Costiera e Cilento', comuni: ['Amalfi', 'Agropoli', 'Vallo della Lucania', 'Sapri', 'Capaccio Paestum'] },
  { nome: 'Benevento', comuni: ['Benevento', 'Montesarchio', 'San Giorgio del Sannio', 'Airola', 'Telese Terme'] },
  { nome: 'Avellino', comuni: ['Avellino', 'Ariano Irpino', 'Atripalda', 'Mercogliano', 'Solofra'] },

  // ═══ SUD - Regioni vicine ═══
  // Lazio
  { nome: 'Roma centro', comuni: ['Roma'] },
  { nome: 'Roma nord', comuni: ['Viterbo', 'Civitavecchia', 'Rieti', 'Monterotondo', 'Guidonia'] },
  { nome: 'Roma sud', comuni: ['Latina', 'Frosinone', 'Cassino', 'Formia', 'Aprilia'] },
  { nome: 'Castelli e litorale', comuni: ['Frascati', 'Velletri', 'Albano Laziale', 'Ostia', 'Fiumicino'] },

  // Puglia
  { nome: 'Bari', comuni: ['Bari', 'Altamura', 'Molfetta', 'Bitonto', 'Corato'] },
  { nome: 'Lecce e Salento', comuni: ['Lecce', 'Brindisi', 'Gallipoli', 'Nardo\'', 'Maglie'] },
  { nome: 'Taranto e Foggia', comuni: ['Taranto', 'Foggia', 'Andria', 'Barletta', 'Trani'] },

  // Calabria
  { nome: 'Cosenza e Catanzaro', comuni: ['Cosenza', 'Catanzaro', 'Rende', 'Lamezia Terme', 'Crotone'] },
  { nome: 'Reggio Calabria', comuni: ['Reggio Calabria', 'Vibo Valentia', 'Siderno', 'Gioia Tauro', 'Palmi'] },

  // Basilicata e Molise
  { nome: 'Basilicata', comuni: ['Potenza', 'Matera', 'Melfi', 'Lauria', 'Pisticci'] },
  { nome: 'Molise', comuni: ['Campobasso', 'Isernia', 'Termoli', 'Venafro', 'Bojano'] },

  // Sicilia
  { nome: 'Palermo', comuni: ['Palermo', 'Monreale', 'Bagheria', 'Carini', 'Partinico'] },
  { nome: 'Catania', comuni: ['Catania', 'Acireale', 'Misterbianco', 'Paternò', 'Giarre'] },
  { nome: 'Sicilia orientale', comuni: ['Messina', 'Siracusa', 'Ragusa', 'Modica', 'Taormina'] },
  { nome: 'Sicilia occidentale', comuni: ['Trapani', 'Agrigento', 'Marsala', 'Mazara del Vallo', 'Caltanissetta'] },
  { nome: 'Sicilia centrale', comuni: ['Enna', 'Gela', 'Caltagirone', 'Piazza Armerina', 'Niscemi'] },

  // Sardegna
  { nome: 'Cagliari', comuni: ['Cagliari', 'Quartu Sant\'Elena', 'Selargius', 'Assemini', 'Capoterra'] },
  { nome: 'Sardegna nord', comuni: ['Sassari', 'Olbia', 'Alghero', 'Tempio Pausania', 'Porto Torres'] },
  { nome: 'Sardegna centro', comuni: ['Nuoro', 'Oristano', 'Tortolì', 'Macomer', 'Carbonia'] },

  // ═══ CENTRO ═══
  // Abruzzo
  { nome: 'Abruzzo costa', comuni: ['Pescara', 'Chieti', 'Ortona', 'Vasto', 'San Salvo'] },
  { nome: 'Abruzzo interno', comuni: ['L\'Aquila', 'Teramo', 'Avezzano', 'Sulmona', 'Giulianova'] },

  // Toscana
  { nome: 'Firenze', comuni: ['Firenze', 'Scandicci', 'Sesto Fiorentino', 'Campi Bisenzio', 'Bagno a Ripoli'] },
  { nome: 'Toscana costa', comuni: ['Livorno', 'Pisa', 'Viareggio', 'Piombino', 'Grosseto'] },
  { nome: 'Toscana interna', comuni: ['Siena', 'Arezzo', 'Lucca', 'Pistoia', 'Prato'] },
  { nome: 'Toscana sud', comuni: ['Montepulciano', 'Cortona', 'Massa', 'Carrara', 'Empoli'] },

  // Umbria e Marche
  { nome: 'Umbria', comuni: ['Perugia', 'Terni', 'Foligno', 'Spoleto', 'Citta\' di Castello'] },
  { nome: 'Marche nord', comuni: ['Pesaro', 'Urbino', 'Fano', 'Ancona', 'Senigallia'] },
  { nome: 'Marche sud', comuni: ['Macerata', 'Fermo', 'Ascoli Piceno', 'San Benedetto del Tronto', 'Civitanova Marche'] },

  // ═══ NORD ═══
  // Emilia-Romagna
  { nome: 'Bologna', comuni: ['Bologna', 'Imola', 'Casalecchio di Reno', 'San Lazzaro', 'Castel Maggiore'] },
  { nome: 'Romagna', comuni: ['Rimini', 'Ravenna', 'Forli\'', 'Cesena', 'Riccione'] },
  { nome: 'Emilia', comuni: ['Modena', 'Reggio Emilia', 'Parma', 'Piacenza', 'Ferrara'] },
  { nome: 'Emilia sud', comuni: ['Carpi', 'Sassuolo', 'Formigine', 'Fidenza', 'Guastalla'] },

  // Lombardia
  { nome: 'Milano centro', comuni: ['Milano'] },
  { nome: 'Milano hinterland nord', comuni: ['Monza', 'Sesto San Giovanni', 'Cinisello Balsamo', 'Desio', 'Lissone'] },
  { nome: 'Milano hinterland sud', comuni: ['Rozzano', 'San Donato Milanese', 'Corsico', 'Buccinasco', 'Opera'] },
  { nome: 'Bergamo e Brescia', comuni: ['Bergamo', 'Brescia', 'Treviglio', 'Romano di Lombardia', 'Dalmine'] },
  { nome: 'Como e Varese', comuni: ['Como', 'Varese', 'Busto Arsizio', 'Gallarate', 'Saronno'] },
  { nome: 'Lombardia est', comuni: ['Mantova', 'Cremona', 'Lodi', 'Crema', 'Pavia'] },
  { nome: 'Lombardia laghi', comuni: ['Lecco', 'Sondrio', 'Vigevano', 'Voghera', 'Legnano'] },

  // Piemonte
  { nome: 'Torino', comuni: ['Torino', 'Moncalieri', 'Rivoli', 'Collegno', 'Nichelino'] },
  { nome: 'Piemonte nord', comuni: ['Novara', 'Vercelli', 'Biella', 'Verbania', 'Borgomanero'] },
  { nome: 'Piemonte sud', comuni: ['Cuneo', 'Asti', 'Alessandria', 'Alba', 'Tortona'] },

  // Liguria
  { nome: 'Genova', comuni: ['Genova', 'Rapallo', 'Chiavari', 'Sestri Levante', 'Recco'] },
  { nome: 'Liguria ponente-levante', comuni: ['Savona', 'Sanremo', 'Imperia', 'La Spezia', 'Albenga'] },

  // Veneto
  { nome: 'Venezia e Padova', comuni: ['Venezia', 'Padova', 'Mestre', 'Chioggia', 'Abano Terme'] },
  { nome: 'Verona e Vicenza', comuni: ['Verona', 'Vicenza', 'Villafranca di Verona', 'Legnago', 'Bassano del Grappa'] },
  { nome: 'Treviso e Belluno', comuni: ['Treviso', 'Belluno', 'Conegliano', 'Montebelluna', 'Castelfranco Veneto'] },
  { nome: 'Veneto sud', comuni: ['Rovigo', 'Este', 'Monselice', 'Cittadella', 'Thiene'] },

  // Friuli e Trentino
  { nome: 'Friuli Venezia Giulia', comuni: ['Trieste', 'Udine', 'Pordenone', 'Gorizia', 'Monfalcone'] },
  { nome: 'Trentino-Alto Adige', comuni: ['Trento', 'Bolzano', 'Rovereto', 'Merano', 'Bressanone'] },

  // Valle d'Aosta
  { nome: 'Valle d\'Aosta', comuni: ['Aosta', 'Chatillon', 'Saint-Vincent', 'Sarre', 'Gressan'] },
] as const;

export const SETTORI_TARGET = [
  'ristorante',
  'pizzeria',
  'bar caffetteria',
  'hotel bed and breakfast',
  'parrucchiere salone bellezza',
  'centro estetico spa',
  'palestra centro fitness',
  'dentista studio dentistico',
  'studio medico',
  'avvocato studio legale',
  'commercialista',
  'agenzia immobiliare',
  'negozio abbigliamento',
  'officina meccanico',
  'panificio pasticceria',
  'farmacia',
  'veterinario',
  'fotografo',
  'impresa edile',
  'negozio arredamento',
] as const;

/**
 * Calcola quale zona e settore cercare oggi.
 * Ciclo completo = ZONE_RICERCA.length giorni (copre tutta Italia).
 * Ogni ricerca prova 2 settori diversi per zona.
 */
export function getRicercaDelGiorno(date: Date = new Date()): {
  zona: typeof ZONE_RICERCA[number];
  settori: string[];
  zonaIndex: number;
  giornoCiclo: number;
  giorniTotaliCiclo: number;
} {
  const daysSinceEpoch = Math.floor(date.getTime() / (1000 * 60 * 60 * 24));

  const zonaIndex = daysSinceEpoch % ZONE_RICERCA.length;

  // 2 settori per ricerca, ruotano indipendentemente
  const settoreBase = (daysSinceEpoch * 2) % SETTORI_TARGET.length;
  const settori = [
    SETTORI_TARGET[settoreBase],
    SETTORI_TARGET[(settoreBase + 1) % SETTORI_TARGET.length],
  ];

  return {
    zona: ZONE_RICERCA[zonaIndex],
    settori,
    zonaIndex,
    giornoCiclo: zonaIndex + 1,
    giorniTotaliCiclo: ZONE_RICERCA.length,
  };
}
