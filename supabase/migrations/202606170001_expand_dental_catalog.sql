-- ============================================================
-- Migration : 202606170001_expand_dental_catalog
-- Purpose   : Expand global dental treatment_catalog from 30 → ~272 entries.
--             All rows are global reference data only.
--             No clinic treatments are created or modified.
--             No prices. No activation.
-- Idempotent: ON CONFLICT (slug) DO NOTHING — safe to re-run.
-- Categories: uses only the 11 values allowed by the existing CHECK
--             constraint (preventive, restorative, endodontics, surgery,
--             orthodontics, prosthetics, periodontics, diagnostic,
--             pediatric, anesthesia, other).
-- DO NOT apply directly — use `supabase db push` or the dashboard.
-- ============================================================

insert into public.treatment_catalog
  (slug, name_es, name_en, name_hr, aliases,
   category, default_duration_minutes, default_price_mode, active)
values

-- ============================================================
-- DIAGNOSTIC — 21 new entries (existing: 3 → total: 24)
-- ============================================================

  ('examen-dental-completo',
   'Examen dental completo', 'Comprehensive Dental Exam', 'Sveobuhvatni dentalni pregled',
   array['examen completo','comprehensive exam','sveobuhvatni pregled','historia clinica dental','full dental exam'],
   'diagnostic', 45, 'consult', true),

  ('radiografia-periapical',
   'Radiografía periapical', 'Periapical X-Ray', 'Periapikalni RTG',
   array['radiografia periapical','periapical xray','periapikalni rtg','rx periapical','rx pa'],
   'diagnostic', 10, 'exact', true),

  ('radiografia-aleta-mordida',
   'Radiografía aleta de mordida', 'Bitewing X-Ray', 'RTG krila ugriza',
   array['aleta mordida','bitewing','bitewing xray','rtg krila','radiografia interproximal'],
   'diagnostic', 10, 'exact', true),

  ('radiografia-oclusal',
   'Radiografía oclusal', 'Occlusal X-Ray', 'Okluzalni RTG',
   array['radiografia oclusal','occlusal xray','okluzalni rtg','rx oclusal'],
   'diagnostic', 10, 'exact', true),

  ('escaner-intraoral',
   'Escáner intraoral digital', 'Intraoral Digital Scan', 'Digitalni intraoralni skener',
   array['escaner intraoral','intraoral scan','digital scan','impresion digital','digitalni otisak','3shape','itero'],
   'diagnostic', 30, 'from', true),

  ('fotografia-intraoral',
   'Fotografía intraoral clínica', 'Clinical Intraoral Photography', 'Intraoralna klinička fotografija',
   array['fotografia intraoral','intraoral photography','fotografia dental clinica','foto intraoral'],
   'diagnostic', 15, 'exact', true),

  ('fotografia-extraoral',
   'Fotografía extraoral', 'Extraoral Photography', 'Ekstraoralna fotografija',
   array['fotografia extraoral','extraoral photography','foto facial dental','registro fotografico'],
   'diagnostic', 15, 'exact', true),

  ('cribado-cancer-oral',
   'Cribado de cáncer oral', 'Oral Cancer Screening', 'Probir raka usne šupljine',
   array['cancer oral','oral cancer screening','probir raka','deteccion cancer boca','lesiones orales'],
   'diagnostic', 15, 'exact', true),

  ('analisis-oclusal-digital',
   'Análisis oclusal digital', 'Digital Occlusal Analysis', 'Digitalna analiza okluzije',
   array['analisis oclusal','occlusal analysis','digitalna okluzija','t-scan','tekscan','registro oclusal'],
   'diagnostic', 20, 'from', true),

  ('estudio-modelos-diagnosticos',
   'Estudio de modelos diagnósticos', 'Diagnostic Study Models', 'Dijagnostički modeli',
   array['modelos estudio','study models','dijagnnosticki modeli','montaje articulador','impresiones diagnosticas'],
   'diagnostic', 30, 'from', true),

  ('analisis-cefalometrico',
   'Análisis cefalométrico', 'Cephalometric Analysis', 'Kefalometrijska analiza',
   array['cefalometria','cephalometric','kefalometrija','telerradiografia','cefalograma'],
   'diagnostic', 20, 'from', true),

  ('prueba-vitalidad-pulpar',
   'Prueba de vitalidad pulpar', 'Pulp Vitality Test', 'Test vitalnosti pulpe',
   array['vitalidad pulpar','pulp vitality','vitalnost pulpe','prueba frio calor','test pulpar'],
   'diagnostic', 10, 'exact', true),

  ('sondaje-periodontal-completo',
   'Sondaje periodontal completo', 'Full Mouth Periodontal Probing', 'Potpuno parodontalno sondiranje',
   array['sondaje periodontal','periodontal probing','parodontalno sondiranje','indices periodontales','boca completa'],
   'diagnostic', 30, 'exact', true),

  ('analisis-digital-sonrisa',
   'Análisis digital de sonrisa', 'Digital Smile Analysis', 'Digitalna analiza osmijeha',
   array['analisis sonrisa','smile analysis','digital smile design','dsd','planificacion estetica'],
   'diagnostic', 30, 'from', true),

  ('screaning-apnea-sueno',
   'Cribado de apnea del sueño', 'Sleep Apnea Screening', 'Probir apneje u snu',
   array['apnea sueno','sleep apnea','apneja','ronquido','dispositivo reposicionador mandibular'],
   'diagnostic', 20, 'consult', true),

  ('monitorizacion-lesion-oral',
   'Monitorización de lesión oral', 'Oral Lesion Monitoring', 'Praćenje oralne lezije',
   array['monitorizar lesion','lesion monitoring','pracenje lezije','lesion benigna oral','seguimiento lesion'],
   'diagnostic', 15, 'exact', true),

  ('mapeo-sensibilidad-dental',
   'Mapeo de sensibilidad dental', 'Dental Sensitivity Mapping', 'Mapiranje osjetljivosti zuba',
   array['sensibilidad dental','sensitivity mapping','osjetljivost zuba','hipersensibilidad dentinaria'],
   'diagnostic', 15, 'exact', true),

  ('diagnostico-radiologico-completo',
   'Diagnóstico radiológico completo', 'Full Mouth Radiographic Survey', 'Potpuni radiološki pregled',
   array['serie radiologica completa','full mouth xray','fmx','serie periapical','boca completa rx'],
   'diagnostic', 30, 'from', true),

  ('evaluacion-estetica-facial',
   'Evaluación estética facial', 'Facial Aesthetic Evaluation', 'Procjena estetike lica',
   array['evaluacion estetica','aesthetic evaluation','estetika lica','proporcion facial','golden ratio dental'],
   'diagnostic', 30, 'consult', true),

  ('analisis-atm-diagnostico',
   'Análisis diagnóstico de ATM', 'TMJ Diagnostic Analysis', 'Dijagnostička analiza TMZ',
   array['analisis atm','tmj analysis','analiza tmz','articulacion temporomandibular','disfuncion mandibular'],
   'diagnostic', 30, 'consult', true),

  ('foto-documentacion-clinica',
   'Documentación fotográfica clínica', 'Clinical Photo Documentation', 'Klinička fotografska dokumentacija',
   array['documentacion fotografica','clinical photos','fotografska dokumentacija','registro imagenes'],
   'diagnostic', 20, 'exact', true),

-- ============================================================
-- PREVENTIVE — 26 new entries (existing: 4 → total: 30)
-- ============================================================

  ('detartraje-supragingival',
   'Detartraje supragingival', 'Supragingival Scaling', 'Supragingivno uklanjanje kamenca',
   array['detartraje','tartar removal','uklanjanje kamenca','raspado supragingival','scaling','sarro dental'],
   'preventive', 30, 'exact', true),

  ('detartraje-subgingival',
   'Detartraje subgingival', 'Subgingival Scaling', 'Subgingivno uklanjanje kamenca',
   array['detartraje subgingival','subgingival scaling','subgingivno','raspado bolsas','limpieza profunda bolsas'],
   'preventive', 45, 'from', true),

  ('profilaxis-adulto',
   'Profilaxis dental adulto', 'Adult Dental Prophylaxis', 'Dentalna profilaksa odrasli',
   array['profilaxis','prophylaxis','profilaksa','pulido dental','limpieza mantenimiento'],
   'preventive', 30, 'exact', true),

  ('instruccion-higiene-oral',
   'Instrucción de higiene oral', 'Oral Hygiene Instruction', 'Uputa o oralnoj higijeni',
   array['higiene oral','oral hygiene','uputa higijeni','ensenanza cepillado','tecnica higiene'],
   'preventive', 20, 'exact', true),

  ('barniz-fluoruro',
   'Barniz de flúor profesional', 'Professional Fluoride Varnish', 'Profesionalni lak s fluorom',
   array['barniz fluor','fluoride varnish','lak fluor','varnish fluor'],
   'preventive', 15, 'exact', true),

  ('gel-fluoruro-profesional',
   'Gel de flúor profesional', 'Professional Fluoride Gel', 'Profesionalni fluoridni gel',
   array['gel fluor','fluoride gel','fluoridni gel','cubeta fluor','aplicacion gel fluoruro'],
   'preventive', 20, 'exact', true),

  ('control-placa-bacteriana',
   'Control de placa bacteriana', 'Plaque Control', 'Kontrola bakterijskog plaka',
   array['control placa','plaque control','kontrola plaka','revelador placa','placa dental'],
   'preventive', 20, 'exact', true),

  ('sellado-fisuras-adulto',
   'Sellado de fisuras en adulto', 'Adult Fissure Sealant', 'Pečatiranje fisura odrasli',
   array['sellado adulto','adult sealant','pecatiranje odrasli','sellado molar adulto'],
   'preventive', 20, 'exact', true),

  ('eliminacion-manchas-extrinsecas',
   'Eliminación de manchas extrínsecas', 'Extrinsic Stain Removal', 'Uklanjanje izvanjskih mrlja',
   array['manchas cafe','coffee stains','mrlje zubi','air flow','pulido manchas','manchas tabaco'],
   'preventive', 30, 'exact', true),

  ('irrigacion-subgingival',
   'Irrigación subgingival', 'Subgingival Irrigation', 'Subgingivna irigacija',
   array['irrigacion subgingival','subgingival irrigation','subgingivna irigacija','clorhexidina subgingival'],
   'preventive', 20, 'exact', true),

  ('mantenimiento-periodontal',
   'Mantenimiento periodontal (SPT)', 'Supportive Periodontal Therapy', 'Suportivna parodontalna terapija',
   array['mantenimiento periodontal','spt','supportive periodontal','parodontalno odrzavanje','recall periodontal'],
   'preventive', 45, 'exact', true),

  ('control-caries-riesgo',
   'Evaluación de riesgo de caries', 'Caries Risk Assessment', 'Procjena rizika od karijesa',
   array['riesgo caries','caries risk','rizik karijesa','cariogram','prevencion caries'],
   'preventive', 20, 'consult', true),

  ('aplicacion-clorhexidina',
   'Aplicación de clorhexidina', 'Chlorhexidine Application', 'Primjena klorheksidina',
   array['clorhexidina','chlorhexidine','klorheksidin','antiseptico bucal','colutorios','enjuague clorhexidina'],
   'preventive', 10, 'exact', true),

  ('desensibilizacion-dental',
   'Desensibilización dental', 'Dental Desensitization', 'Desenzitizacija zuba',
   array['desensibilizacion','sensitivity treatment','dientes sensibles','desenzitizacija','hipersensibilidad dentinaria'],
   'preventive', 20, 'exact', true),

  ('fluorizacion-profesional',
   'Fluorización profesional', 'Professional Fluoridation', 'Profesionalna fluoridacija',
   array['fluorizacion','fluoridation','fluoridacija','prevencion fluoruro','fluor topico profesional'],
   'preventive', 15, 'exact', true),

  ('blanqueamiento-domicilio',
   'Blanqueamiento dental domiciliario', 'Home Teeth Whitening Kit', 'Kućno izbjeljivanje zuba',
   array['blanqueamiento casa','home whitening','kucno izbjeljivanje','whitening kit','cubetas blanqueamiento'],
   'preventive', 20, 'from', true),

  ('aplicacion-ozono-dental',
   'Aplicación de ozono dental', 'Dental Ozone Therapy', 'Dentalna ozon terapija',
   array['ozono dental','ozone therapy','ozon terapija','ozonizacion','tratamiento ozono'],
   'preventive', 15, 'from', true),

  ('sealant-remineralizante',
   'Sellante remineralizante', 'Remineralizing Sealant', 'Remineralizirajući pečat',
   array['sellante remineralizante','remineralizing','remineralizacija','calcio fosfato','mi paste'],
   'preventive', 15, 'exact', true),

  ('limpieza-protesis-removible',
   'Limpieza profesional de prótesis removible', 'Professional Denture Cleaning', 'Profesionalno čišćenje proteze',
   array['limpieza protesis','denture cleaning','ciscenje proteze','ultrasonic denture','higiene protesis'],
   'preventive', 20, 'exact', true),

  ('control-blanqueamiento',
   'Control de blanqueamiento dental', 'Whitening Maintenance Check', 'Kontrolni pregled izbjeljivanja',
   array['control blanqueamiento','whitening check','kontrola izbjeljivanja','revision blanqueamiento'],
   'preventive', 15, 'exact', true),

  ('profilaxis-implante',
   'Profilaxis periimplantaria', 'Peri-implant Maintenance', 'Periimplantatno čišćenje',
   array['mantenimiento implante','periimplant maintenance','periimplantatno','limpieza implante','profilaxis implante'],
   'preventive', 30, 'exact', true),

  ('control-postortodoncia',
   'Control post-ortodoncia', 'Post-Orthodontic Checkup', 'Pregled nakon ortodoncije',
   array['revision ortodoncia','post-ortho','postortodoncija','control contencion','seguimiento ortodoncia'],
   'preventive', 20, 'exact', true),

  ('prevencion-bruxismo-consult',
   'Consulta de prevención de bruxismo', 'Bruxism Prevention Consultation', 'Savjetovanje o bruksizmu',
   array['prevencion bruxismo','bruxism consult','savjetovanje bruksizam','rechinar prevencion','apretamiento dental'],
   'preventive', 20, 'consult', true),

  ('educacion-nutricional-oral',
   'Educación nutricional para salud oral', 'Nutritional Counseling for Oral Health', 'Savjetovanje o prehrani i oralnom zdravlju',
   array['dieta salud oral','nutrition oral health','prehrana zubi','azucar caries','alimentacion dental'],
   'preventive', 15, 'consult', true),

  ('revision-periodontal-mantenimiento',
   'Revisión periodontal de mantenimiento', 'Periodontal Maintenance Review', 'Kontrolni parodontalni pregled',
   array['revision periodontal','periodontal review','kontrolni parodontalni','seguimiento periodontal'],
   'preventive', 30, 'exact', true),

  ('pulido-coronas-protesis',
   'Pulido de coronas y prótesis', 'Crown and Prosthesis Polishing', 'Poliranje krunica i proteza',
   array['pulido coronas','crown polishing','poliranje krunica','brillo dental','acabado protesis'],
   'preventive', 20, 'exact', true),

-- ============================================================
-- RESTORATIVE — 27 new entries (existing: 2 → total: 29)
-- ============================================================

  ('composite-clase-i',
   'Composite clase I (oclusal)', 'Class I Composite Filling', 'Kompozit klase I (okluzalni)',
   array['composite clase 1','class 1 filling','kompozit klase 1','empaste oclusal','obturacion oclusal'],
   'restorative', 30, 'exact', true),

  ('composite-clase-ii',
   'Composite clase II (interproximal)', 'Class II Composite Filling', 'Kompozit klase II (interproksimalni)',
   array['composite clase 2','class 2 filling','kompozit klase 2','empaste interproximal','obturacion mesial distal'],
   'restorative', 45, 'exact', true),

  ('composite-clase-iii',
   'Composite clase III (anterior interproximal)', 'Class III Composite Filling', 'Kompozit klase III',
   array['composite clase 3','class 3 filling','kompozit klase 3','empaste anterior interproximal'],
   'restorative', 40, 'exact', true),

  ('composite-clase-iv',
   'Composite clase IV (ángulo incisal)', 'Class IV Composite Filling', 'Kompozit klase IV (incizalni kut)',
   array['composite clase 4','class 4 filling','kompozit klase 4','reconstruccion angulo incisal','fractura borde incisal'],
   'restorative', 45, 'from', true),

  ('composite-clase-v',
   'Composite clase V (cervical)', 'Class V Composite Filling', 'Kompozit klase V (cervikalni)',
   array['composite clase 5','class 5','composite cervical','kompozit klase 5','abrasion cervical resina'],
   'restorative', 30, 'exact', true),

  ('amalgama-dental',
   'Restauración de amalgama', 'Dental Amalgam Filling', 'Amalgamski ispun',
   array['amalgama','amalgam filling','amalgamski ispun','plata dental','empaste plata'],
   'restorative', 30, 'exact', true),

  ('incrustacion-resina-inlay',
   'Incrustación de resina (inlay)', 'Resin Inlay', 'Kompozitni inlay',
   array['inlay resina','resin inlay','kompozitni inlay','incrustacion composite','restauracion indirecta resina'],
   'restorative', 75, 'from', true),

  ('incrustacion-ceramica',
   'Incrustación cerámica (inlay)', 'Ceramic Inlay', 'Keramički inlay',
   array['inlay ceramico','ceramic inlay','keramicki inlay','inlay porcelana','restauracion ceramica indirecta'],
   'restorative', 90, 'from', true),

  ('incrustacion-oro',
   'Incrustación de oro (inlay)', 'Gold Inlay', 'Zlatni inlay',
   array['inlay oro','gold inlay','zlatni inlay','incrustacion metal noble','restauracion oro'],
   'restorative', 90, 'from', true),

  ('onlay-resina',
   'Onlay de resina', 'Resin Onlay', 'Kompozitni onlay',
   array['onlay resina','resin onlay','kompozitni onlay','cusp coverage resin','recubrimiento cuspide resina'],
   'restorative', 75, 'from', true),

  ('onlay-ceramica',
   'Onlay cerámico', 'Ceramic Onlay', 'Keramički onlay',
   array['onlay ceramico','ceramic onlay','keramicki onlay','onlay porcelana','recubrimiento ceramico'],
   'restorative', 90, 'from', true),

  ('overlay-ceramica',
   'Overlay cerámico (cubrimiento total)', 'Ceramic Overlay', 'Keramički overlay',
   array['overlay ceramico','ceramic overlay','keramicki overlay','cubrimiento total ceramica','table top'],
   'restorative', 90, 'from', true),

  ('reconstruccion-munon',
   'Reconstrucción de muñón', 'Core Buildup', 'Nadogradnja bataljka',
   array['reconstruccion munon','core buildup','nadogradnja bataljka','perno munon','munon colado','pino fibra'],
   'restorative', 45, 'from', true),

  ('restauracion-temporal',
   'Restauración temporal', 'Temporary Restoration', 'Privremena restauracija',
   array['temporal','temporary filling','privremena plomba','empaste provisional','cemento temporal','oxido zinc'],
   'restorative', 20, 'exact', true),

  ('restauracion-fibra-vidrio',
   'Restauración con fibra de vidrio', 'Fiberglass-Reinforced Restoration', 'Restauracija ojačana staklenim vlaknima',
   array['fibra vidrio','fiberglass','staklena vlakna','fibra refuerzo','composito fibra'],
   'restorative', 45, 'from', true),

  ('cementado-provisional',
   'Cementado provisional', 'Provisional Cementation', 'Privremeno cementiranje',
   array['cemento provisional','provisional cement','privremeni cement','corona provisional cementada'],
   'restorative', 15, 'exact', true),

  ('reposicion-empaste',
   'Reposición de empaste existente', 'Filling Replacement', 'Zamjena postojeće plombe',
   array['cambio empaste','filling replacement','zamjena plombe','reemplazar restauracion','empaste roto'],
   'restorative', 40, 'exact', true),

  ('restauracion-erosion-dental',
   'Restauración por erosión dental', 'Erosion Restoration', 'Restauracija zbog dentalne erozije',
   array['erosion dental','erosion restoration','dentalna erozija','desgaste acido','bruxismo desgaste'],
   'restorative', 45, 'from', true),

  ('cierre-diastema-composite',
   'Cierre de diastema con composite', 'Composite Diastema Closure', 'Zatvaranje dijasteme kompozitom',
   array['cierre diastema','diastema closure','zatvaranje dijasteme','espacio entre dientes composite'],
   'restorative', 60, 'from', true),

  ('restauracion-cad-cam',
   'Restauración CAD/CAM (mismo día)', 'CAD/CAM Same-Day Restoration', 'CAD/CAM restauracija',
   array['cad cam','cerec','same day crown','restauracion digital','corona mismo dia','cadcam','endo crown'],
   'restorative', 90, 'from', true),

  ('composite-flow-cervical',
   'Composite fluido (cervical/sellado)', 'Flowable Composite', 'Tekući kompozit',
   array['composite fluido','flowable composite','tekuci kompozit','resina fluida','sellado fisura composite'],
   'restorative', 20, 'exact', true),

  ('restauracion-abfraccion',
   'Restauración de abfracción cervical', 'Cervical Abfraction Restoration', 'Restauracija abfrakcije',
   array['abfraccion','abfraction','abfrakcija','lesion cuello cervical','composite cuello'],
   'restorative', 30, 'exact', true),

  ('sellado-cervical-erosion',
   'Sellado de lesión cervical', 'Cervical Lesion Sealing', 'Pečatiranje cervikalne lezije',
   array['sellado cervical','cervical sealing','cervikalni pečat','proteccion cuello dental'],
   'restorative', 20, 'exact', true),

  ('composite-anterior-estetico',
   'Composite anterior estético', 'Aesthetic Anterior Composite', 'Estetski prednji kompozit',
   array['composite estetico anterior','aesthetic composite','estetski kompozit','composite frente','restauracion estetica directa'],
   'restorative', 60, 'from', true),

  ('incrustacion-parcial-ceramica',
   'Incrustación parcial cerámica (½ corona)', 'Ceramic Partial Coverage Restoration', 'Parcijalna keramička restauracija',
   array['media corona ceramica','partial ceramic','parcijalna keramika','3/4 corona ceramica'],
   'restorative', 90, 'from', true),

  ('reparacion-protesis-removible',
   'Reparación de prótesis removible', 'Removable Denture Repair', 'Popravak mobilne proteze',
   array['reparacion protesis','denture repair','popravak proteze','fractura protesis','pegado protesis'],
   'restorative', 45, 'from', true),

  ('reparacion-corona-existente',
   'Reparación de corona existente', 'Existing Crown Repair', 'Popravak postojeće krunice',
   array['reparacion corona','crown repair','popravak krunice','fractura corona','restaurar corona rota'],
   'restorative', 30, 'from', true),

-- ============================================================
-- ENDODONTICS — 18 new entries (existing: 1 → total: 19)
-- ============================================================

  ('endodoncia-1-conducto',
   'Endodoncia 1 conducto', 'Single Canal Root Canal', 'Endodontski tretman 1 kanal',
   array['endodoncia 1 conducto','single canal','jedan kanal','canal uniradicular','monoradicular'],
   'endodontics', 60, 'from', true),

  ('endodoncia-2-conductos',
   'Endodoncia 2 conductos', 'Two Canal Root Canal', 'Endodontski tretman 2 kanala',
   array['endodoncia 2 conductos','two canal','dva kanala','biradicular endodoncia'],
   'endodontics', 75, 'from', true),

  ('endodoncia-3-conductos',
   'Endodoncia 3 conductos', 'Three Canal Root Canal', 'Endodontski tretman 3 kanala',
   array['endodoncia 3 conductos','three canal','tri kanala','triradicular','molar endodoncia'],
   'endodontics', 90, 'from', true),

  ('endodoncia-4-conductos',
   'Endodoncia 4 conductos', 'Four Canal Root Canal', 'Endodontski tretman 4 kanala',
   array['endodoncia 4 conductos','four canal','cetiri kanala','molar superior endodoncia','cuatro conductos'],
   'endodontics', 105, 'from', true),

  ('endodoncia-retratamiento',
   'Retratamiento endodóntico', 'Endodontic Retreatment', 'Ponovljeno endodontsko liječenje',
   array['retratamiento','retreatment','ponovljeni kanal','reendodoncia','revision conducto'],
   'endodontics', 90, 'from', true),

  ('pulpotomia',
   'Pulpotomía', 'Pulpotomy', 'Pulpotomija',
   array['pulpotomia','pulpotomy','pulpotomija','amputacion pulpar','extirpacion parcial pulpa'],
   'endodontics', 45, 'from', true),

  ('pulpectomia',
   'Pulpectomía', 'Pulpectomy', 'Pulpektomija',
   array['pulpectomia','pulpectomy','pulpektomija','extirpacion total pulpa','biopulpectomia'],
   'endodontics', 60, 'from', true),

  ('apicectomia',
   'Apicectomía', 'Apicoectomy', 'Apikotomija',
   array['apicectomia','apicoectomy','apikotomija','cirugia apical','reseccion apice radicular'],
   'endodontics', 60, 'from', true),

  ('obturacion-mta',
   'Obturación con MTA', 'MTA Obturation', 'MTA punjenje kanala',
   array['mta','mineral trioxide aggregate','obturacion mta','mta punjenje','apicoformacion'],
   'endodontics', 60, 'from', true),

  ('recubrimiento-pulpar-directo',
   'Recubrimiento pulpar directo', 'Direct Pulp Capping', 'Direktno prekrivanje pulpe',
   array['recubrimiento pulpar directo','direct pulp cap','direktno prekrivanje','capado pulpar','mta pulpar'],
   'endodontics', 30, 'from', true),

  ('recubrimiento-pulpar-indirecto',
   'Recubrimiento pulpar indirecto', 'Indirect Pulp Capping', 'Indirektno prekrivanje pulpe',
   array['recubrimiento indirecto','indirect pulp cap','indirektno prekrivanje','dentina afectada proteccion'],
   'endodontics', 30, 'from', true),

  ('endodoncia-microscopio',
   'Endodoncia con microscopio', 'Microscope-Assisted Endodontics', 'Endodoncija pod mikroskopom',
   array['endodoncia microscopio','microscope endodontics','endodoncija mikroskop','endodoncia magnificacion'],
   'endodontics', 90, 'from', true),

  ('irrigacion-ultrasonidos-endodoncia',
   'Irrigación con ultrasonidos (endodoncia)', 'Ultrasonic Endodontic Irrigation', 'Ultrazvučna irigacija kanala',
   array['irrigacion ultrasonidos','ultrasonic irrigation','ultrazvucna irigacija','activacion irrigante'],
   'endodontics', 20, 'from', true),

  ('sellado-perforacion-radicular',
   'Sellado de perforación radicular', 'Root Perforation Repair', 'Popravak perforacije korijena',
   array['perforacion radicular','perforation repair','perforacija korijena','reparacion perforacion'],
   'endodontics', 60, 'from', true),

  ('regeneracion-pulpar-vital',
   'Regeneración pulpar vital', 'Vital Pulp Regeneration', 'Vitalna regeneracija pulpe',
   array['regeneracion pulpar','pulp regeneration','regeneracija pulpe','revascularizacion pulpar'],
   'endodontics', 60, 'from', true),

  ('extirpacion-pulpar',
   'Extirpación pulpar (1ª visita)', 'Pulp Extirpation (1st visit)', 'Ekstirpacija pulpe (1. posjeta)',
   array['extirpacion pulpar','pulp extirpation','ekstirpacija','primera visita endodoncia','nervio primera sesion'],
   'endodontics', 45, 'from', true),

  ('control-endodoncico',
   'Control endodóntico post-tratamiento', 'Post-Endodontic Checkup', 'Kontrolni pregled nakon endodoncije',
   array['control endodoncia','post-endodontic','kontrola endodoncija','revision conducto tratado'],
   'endodontics', 20, 'exact', true),

  ('medicacion-intraconducto',
   'Medicación intraconducto (visita intermedia)', 'Intracanal Medication (Interim Visit)', 'Intrakanalnog lijeka (međuposjeta)',
   array['medicacion intraconducto','intracanal medication','hidroxido calcio','segunda visita endodoncia'],
   'endodontics', 30, 'exact', true),

-- ============================================================
-- PERIODONTICS — 23 new entries (existing: 1 → total: 24)
-- ============================================================

  ('raspado-alisado-radicular',
   'Raspado y alisado radicular', 'Scaling and Root Planing', 'Kiretaža i glačanje korijena',
   array['raspado radicular','scaling root planing','kiretaza','deep cleaning','curetaje','srp','rar'],
   'periodontics', 60, 'from', true),

  ('curetaje-subgingival',
   'Curetaje subgingival', 'Subgingival Curettage', 'Subgingivna kiretaža',
   array['curetaje','curettage','kiretaza','raspado subgingival','limpieza bolsas periodontales'],
   'periodontics', 45, 'from', true),

  ('cirugia-colgajo-periodontal',
   'Cirugía de colgajo periodontal', 'Periodontal Flap Surgery', 'Kirurgija parodontalnog režnja',
   array['colgajo periodontal','flap surgery','rezanj kirurgija','widman modificado','colgajo mucoperiostio'],
   'periodontics', 90, 'from', true),

  ('injerto-tejido-conjuntivo',
   'Injerto de tejido conjuntivo', 'Connective Tissue Graft', 'Presadak vezivnog tkiva',
   array['injerto conjuntivo','connective tissue graft','presadak vezivnog tkiva','ctg','recubrimiento raiz'],
   'periodontics', 90, 'from', true),

  ('injerto-encia-libre',
   'Injerto de encía libre', 'Free Gingival Graft', 'Slobodni gingivalni presadak',
   array['injerto encia libre','free gingival graft','slobodni gingivalni','fgg','injerto paladar'],
   'periodontics', 90, 'from', true),

  ('alargamiento-corona-periodontal',
   'Alargamiento de corona clínica', 'Clinical Crown Lengthening', 'Produženje kliničke krune',
   array['alargamiento corona','crown lengthening','produzenje krune','espacio biologico','cirugia periodontal corona'],
   'periodontics', 60, 'from', true),

  ('frenectomia',
   'Frenectomía', 'Frenectomy', 'Frenektomija',
   array['frenectomia','frenectomy','frenektomija','frenillo','frenotomia','frenillo labial'],
   'periodontics', 30, 'from', true),

  ('gingivectomia',
   'Gingivectomía', 'Gingivectomy', 'Gingivektomija',
   array['gingivectomia','gingivectomy','gingivektomija','reduccion encias','exeresis gingival','encias grandes'],
   'periodontics', 60, 'from', true),

  ('gingivoplastia',
   'Gingivoplastia', 'Gingivoplasty', 'Gingivoplastika',
   array['gingivoplastia','gingivoplasty','gingivoplastika','remodelado encias','contorneado encias'],
   'periodontics', 60, 'from', true),

  ('regeneracion-osea-guiada',
   'Regeneración ósea guiada (ROG)', 'Guided Bone Regeneration', 'Vođena koštana regeneracija',
   array['regeneracion osea','guided bone regeneration','gbr','rog','membrana regeneracion','injerto oseo periodontal'],
   'periodontics', 90, 'from', true),

  ('regeneracion-tisular-guiada',
   'Regeneración tisular guiada (RTG)', 'Guided Tissue Regeneration', 'Vođena tkivna regeneracija',
   array['regeneracion tisular','guided tissue regeneration','gtr','rtg periodontal','membrana resorbible'],
   'periodontics', 90, 'from', true),

  ('terapia-laser-periodontal',
   'Terapia láser periodontal', 'Laser Periodontal Therapy', 'Laserska parodontalna terapija',
   array['laser periodontal','laser therapy periodontal','laserska parodontalna','laser encías','tratamiento laser bolsas'],
   'periodontics', 45, 'from', true),

  ('descontaminacion-superficie-implante',
   'Descontaminación de superficie de implante', 'Implant Surface Decontamination', 'Dekontaminacija površine implantata',
   array['descontaminacion implante','implant decontamination','dekontaminacija implantata','periimplantitis tratamiento'],
   'periodontics', 45, 'from', true),

  ('recesion-gingival-tratamiento',
   'Tratamiento de recesión gingival', 'Gingival Recession Treatment', 'Liječenje gingivne recesije',
   array['recesion gingival','gingival recession','gingivna recesija','raices expuestas','recubrimiento recesion'],
   'periodontics', 90, 'from', true),

  ('tratamiento-absceso-periodontal',
   'Tratamiento de absceso periodontal', 'Periodontal Abscess Treatment', 'Liječenje parodontalnog apscesa',
   array['absceso periodontal','periodontal abscess','parodontalni apsces','drenaje absceso periodontal'],
   'periodontics', 30, 'from', true),

  ('terapia-antimicrobiana-local',
   'Terapia antimicrobiana local', 'Local Antimicrobial Therapy', 'Lokalna antimikrobna terapija',
   array['antibiotico local','local antimicrobial','lokalni antibiotik','chips antibiotico','arestin'],
   'periodontics', 20, 'from', true),

  ('corona-alargamiento-estetico',
   'Alargamiento de corona estético', 'Aesthetic Crown Lengthening', 'Estetsko produljenje krune',
   array['alargamiento estetico','aesthetic crown lengthening','estetsko produzenje','sonrisa gingival','encias altas'],
   'periodontics', 60, 'from', true),

  ('plastia-tejidos-blandos',
   'Plastia de tejidos blandos', 'Soft Tissue Plasty', 'Plastika mekih tkiva',
   array['plastia tejidos blandos','soft tissue plasty','plastika mekih tkiva','modelado gingival'],
   'periodontics', 60, 'from', true),

  ('tratamiento-mucositis-periimplante',
   'Tratamiento de mucositis periimplantaria', 'Peri-implant Mucositis Treatment', 'Liječenje periimplantatnog mukozitisa',
   array['mucositis periimplante','periimplant mucositis','periimplantatni mukozitis','inflamacion implante encía'],
   'periodontics', 30, 'from', true),

  ('tratamiento-periimplantitis',
   'Tratamiento de periimplantitis', 'Peri-implantitis Treatment', 'Liječenje periimplantitisa',
   array['periimplantitis','periimplantitis treatment','periimplantatitis','infeccion implante hueso'],
   'periodontics', 60, 'from', true),

  ('terapia-periodontal-sistemica',
   'Terapia periodontal sistémica', 'Systemic Periodontal Phase', 'Sustavna parodontalna faza',
   array['fase sistemica periodontal','systemic periodontal','sustavna faza','antibioticos sistemicos periodontal'],
   'periodontics', 20, 'consult', true),

  ('control-periodontal-activo',
   'Control periodontal activo', 'Active Periodontal Recall', 'Aktivni parodontalni kontrolni pregled',
   array['control periodontal','periodontal recall','parodontalni kontrolni','revisión periodontal activa'],
   'periodontics', 30, 'exact', true),

  ('injerto-tejido-blando-multiple',
   'Injerto de tejido blando múltiple', 'Multiple Soft Tissue Graft', 'Višestruki presadak mekog tkiva',
   array['injerto multiple tejido blando','multiple soft tissue graft','visestruki presadak','varios dientes recesion'],
   'periodontics', 120, 'from', true),

-- ============================================================
-- SURGERY (oral surgery + implantology) —
-- 38 new entries (existing: 5 → total: 43)
-- ============================================================

-- Oral surgery
  ('extraccion-quirurgica',
   'Extracción quirúrgica', 'Surgical Extraction', 'Kirurška ekstrakcija',
   array['extraccion quirurgica','surgical extraction','kirurska ekstrakcija','exodontia compleja','colgajo extraccion'],
   'surgery', 45, 'from', true),

  ('extraccion-diente-retenido',
   'Extracción de diente retenido', 'Retained Tooth Extraction', 'Ekstrakcija retiniranog zuba',
   array['diente retenido','retained tooth','retinirani zub','diente incluido parcial','semirretenido'],
   'surgery', 60, 'from', true),

  ('extraccion-fragmento-radicular',
   'Extracción de fragmento radicular', 'Root Fragment Extraction', 'Ekstrakcija korijenskog fragmenta',
   array['fragmento radicular','root fragment','korijenski fragment','resto radicular','raiz retenida'],
   'surgery', 45, 'from', true),

  ('odontectomia-incluido',
   'Odontectomía de diente completamente incluido', 'Fully Impacted Tooth Removal', 'Odontektomija potpuno impaktiranog zuba',
   array['odontectomia','diente incluido','fully impacted','potpuno impaktirani','muela juicio incluida'],
   'surgery', 75, 'from', true),

  ('biopsia-oral',
   'Biopsia oral', 'Oral Biopsy', 'Biopsija usne šupljine',
   array['biopsia oral','oral biopsy','biopsija','biopsia lesion oral','toma biopsia'],
   'surgery', 30, 'from', true),

  ('exeresis-quiste-odontogenico',
   'Exéresis de quiste odontogénico', 'Odontogenic Cyst Excision', 'Enukleacija odontogene ciste',
   array['quiste odontogenico','odontogenic cyst','odontogena cista','enucleacion quiste','quiste dental'],
   'surgery', 60, 'from', true),

  ('marsupializacion-quiste',
   'Marsupialización de quiste', 'Cyst Marsupialization', 'Marsupijalizacija ciste',
   array['marsupialization','marsupializacion','marsupijalizacija','reduccion quiste','quiste grande'],
   'surgery', 45, 'from', true),

  ('frenectomia-lingual',
   'Frenectomía lingual', 'Lingual Frenectomy', 'Lingvalna frenektomija',
   array['frenillo lingual','lingual frenectomy','lingvalna frenektomija','anquiloglosia','lengua atada'],
   'surgery', 30, 'from', true),

  ('frenectomia-labial',
   'Frenectomía labial', 'Labial Frenectomy', 'Labijalna frenektomija',
   array['frenillo labial','labial frenectomy','labijalna frenektomija','frenillo superior','diastema frenillo'],
   'surgery', 30, 'from', true),

  ('exeresis-mucocele',
   'Exéresis de mucocele', 'Mucocele Excision', 'Ekscizija mukokelne',
   array['mucocele','mucocele excision','ekscizija mukocelne','quiste retencion saliva','bola labio'],
   'surgery', 30, 'from', true),

  ('exeresis-fibroma-oral',
   'Exéresis de fibroma oral', 'Oral Fibroma Excision', 'Ekscizija fibroma usne šupljine',
   array['fibroma oral','oral fibroma','fibrom usne supljine','neoformacion oral benigna'],
   'surgery', 30, 'from', true),

  ('drenaje-absceso-dental',
   'Drenaje de absceso dental', 'Dental Abscess Drainage', 'Drenaža dentalnog apscesa',
   array['drenaje absceso','abscess drainage','drenaza apscesa','incision drenaje','fluctuacion absceso'],
   'surgery', 30, 'from', true),

  ('cirugia-apical',
   'Cirugía apical', 'Periapical Surgery', 'Kirurgija vrška korijena',
   array['cirugia apical','periapical surgery','kirurgija vrska','apicectomia cirugia','quiste periapical cirugia'],
   'surgery', 60, 'from', true),

  ('alveoloplastia',
   'Alveoloplastia', 'Alveoloplasty', 'Alveoloplastika',
   array['alveoloplastia','alveoloplasty','alveoloplastika','regularizacion alveolar','cirugia preprotesica hueso'],
   'surgery', 45, 'from', true),

  ('exodontia-multiple',
   'Exodoncia múltiple (misma sesión)', 'Multiple Extractions (Same Session)', 'Višestruka ekstrakcija (ista sesija)',
   array['extracciones multiples','multiple extractions','visestruka ekstrakcija','varios dientes misma sesion'],
   'surgery', 60, 'from', true),

  ('coronectomia',
   'Coronectomía', 'Coronectomy', 'Koronektomija',
   array['coronectomia','coronectomy','koronektomija','seccion corona muela','extraccion parcial juicio'],
   'surgery', 45, 'from', true),

  ('exeresis-torus-mandibular',
   'Exéresis de torus mandibular', 'Mandibular Torus Excision', 'Ekscizija mandibularnog torusa',
   array['torus mandibular','mandibular torus','mandibularni torus','exostosis mandibular','torus'],
   'surgery', 60, 'from', true),

  ('exeresis-torus-palatino',
   'Exéresis de torus palatino', 'Palatine Torus Excision', 'Ekscizija nepčanog torusa',
   array['torus palatino','palatine torus','nepcani torus','exostosis palatina','protuberancia paladar'],
   'surgery', 60, 'from', true),

  ('reposicion-diente-luxado',
   'Reposición de diente luxado / reimplante', 'Tooth Replantation / Repositioning', 'Repozicija luksiranog zuba',
   array['reimplante dental','tooth replantation','repozicija zuba','diente luxado','luxacion dental tratamiento'],
   'surgery', 30, 'from', true),

  ('ferulizacion-dental-trauma',
   'Ferulización dental post-trauma', 'Dental Splinting Post-Trauma', 'Udlaganje zuba nakon traume',
   array['ferulizacion','dental splint','udlaganje','ferula trauma','inmovilizacion diente'],
   'surgery', 30, 'from', true),

-- Implantology (also maps to surgery)
  ('implante-unitario',
   'Implante dental unitario', 'Single Dental Implant', 'Jednokomadni dentalni implantat',
   array['implante unitario','single implant','jednokomadni implantat','implante individual','colocacion implante'],
   'surgery', 60, 'from', true),

  ('implante-multiple',
   'Implantes dentales múltiples', 'Multiple Dental Implants', 'Višestruki dentalni implantati',
   array['implantes multiples','multiple implants','visestruki implantati','varios implantes'],
   'surgery', 90, 'from', true),

  ('carga-inmediata-implante',
   'Carga inmediata sobre implante', 'Immediate Implant Loading', 'Neposredno opterećenje implantata',
   array['carga inmediata','immediate loading','neposredno opterecenje','implante mismo dia','diente en dia'],
   'surgery', 90, 'from', true),

  ('mini-implante-dental',
   'Mini implante dental', 'Mini Dental Implant', 'Mini dentalni implantat',
   array['mini implante','mini implant','mini implantat','implante estrecho','narrow implant'],
   'surgery', 45, 'from', true),

  ('sobredentadura-sobre-implantes',
   'Sobredentadura sobre implantes', 'Implant-Supported Overdenture', 'Proteza na implantatima',
   array['sobredentadura implantes','implant overdenture','proteza na implantatima','bola abutment','locator implante'],
   'surgery', 60, 'from', true),

  ('corona-implante-ceramica',
   'Corona cerámica sobre implante', 'Ceramic Crown on Implant', 'Keramička krunica na implantatu',
   array['corona implante ceramica','ceramic implant crown','keramicka krunica implantat','restauracion implante ceramica'],
   'surgery', 60, 'from', true),

  ('corona-implante-zirconio',
   'Corona de zirconio sobre implante', 'Zirconia Crown on Implant', 'Cirkonska krunica na implantatu',
   array['corona zirconio implante','zirconia implant crown','cirkonska krunica implantat','implante zirconio'],
   'surgery', 60, 'from', true),

  ('puente-sobre-implantes',
   'Puente fijo sobre implantes', 'Implant-Supported Bridge', 'Most na implantatima',
   array['puente implantes','implant bridge','most implantatima','protesis fija implantes parcial'],
   'surgery', 90, 'from', true),

  ('protesis-fija-sobre-implantes',
   'Prótesis fija sobre implantes (arco completo)', 'Fixed Full-Arch Implant Prosthesis', 'Fiksna potpuna proteza na implantatima',
   array['protesis fija implantes','full arch fixed','fiksna potpuna implantatima','boca completa implantes fija'],
   'surgery', 120, 'from', true),

  ('all-on-6',
   'All-on-6 implantes', 'All-on-6 Implants', 'Sve na šest implantata',
   array['all on 6','all on six','sve na sest','arco completo 6 implantes','full arch 6'],
   'surgery', 180, 'from', true),

  ('elevacion-seno-lateral',
   'Elevación de seno maxilar lateral (abierta)', 'Lateral Window Sinus Lift', 'Lateralno podizanje sinusa (otvoreno)',
   array['sinus lift lateral','elevacion seno lateral','lateralno podizanje','open sinus lift','ventana lateral seno'],
   'surgery', 120, 'from', true),

  ('elevacion-seno-endo',
   'Elevación de seno transalveolar (cerrada)', 'Transalveolar Sinus Lift', 'Transalveolarno podizanje sinusa',
   array['osteotome sinus lift','elevacion seno cerrada','transalveolarno podizanje','summers sinus lift'],
   'surgery', 60, 'from', true),

  ('protocolo-carga-inmediata',
   'Protocolo de carga inmediata', 'Immediate Loading Protocol', 'Protokol neposrednog opterećenja',
   array['protocolo carga inmediata','immediate loading protocol','privremena krunica implante','provisionalización implante'],
   'surgery', 90, 'from', true),

  ('retiro-implante',
   'Retiro de implante dental', 'Implant Removal', 'Uklanjanje implantata',
   array['retiro implante','implant removal','uklanjanje implantata','explantacion','fracaso implante'],
   'surgery', 60, 'from', true),

  ('cambio-pilar-implante',
   'Cambio de pilar de implante', 'Implant Abutment Change', 'Promjena nadgradnje implantata',
   array['cambio pilar','abutment change','promjena nadgradnje','pilar implante','abutment implante'],
   'surgery', 30, 'from', true),

  ('impresion-implante-digital',
   'Impresión digital de implante', 'Digital Implant Impression', 'Digitalni otisak implantata',
   array['impresion digital implante','digital implant impression','digitalni otisak','scan body implante'],
   'surgery', 30, 'from', true),

  ('restauracion-implante-provisional',
   'Restauración provisional sobre implante', 'Provisional Implant Restoration', 'Privremena restauracija na implantatu',
   array['provisional implante','provisional implant crown','privremena restauracija implantat','corona provisional implante'],
   'surgery', 45, 'from', true),

  ('cirugia-guiada-implante',
   'Cirugía de implante guiada digitalmente', 'Digitally Guided Implant Surgery', 'Digitalno vođena kirurgija implantata',
   array['cirugia guiada','guided surgery','vodjeno postavljanje implantata','guia quirurgica implante','static guide'],
   'surgery', 90, 'from', true),

-- ============================================================
-- ORTHODONTICS — 17 new entries (existing: 3 → total: 20)
-- ============================================================

  ('brackets-ceramicos',
   'Brackets cerámicos', 'Ceramic Braces', 'Keramičke bravice',
   array['brackets ceramicos','ceramic braces','keramicke bravice','brackets transparentes','ortodoncia estetica'],
   'orthodontics', 60, 'from', true),

  ('brackets-linguales',
   'Brackets linguales', 'Lingual Braces', 'Lingvalne bravice',
   array['brackets linguales','lingual braces','lingvalne bravice','ortodoncia lingual','invisible braces lingual'],
   'orthodontics', 75, 'from', true),

  ('brackets-autoligado',
   'Brackets de autoligado', 'Self-Ligating Braces', 'Samovežući nosači',
   array['brackets autoligado','self ligating','samovezujuci nosaci','damon','speed brackets','autoligado'],
   'orthodontics', 60, 'from', true),

  ('ortodoncia-funcional',
   'Ortodoncia funcional', 'Functional Orthodontics', 'Funkcionalna ortodoncija',
   array['ortodoncia funcional','functional orthodontics','funkcionalna ortodoncija','clase ii aparato','bionator'],
   'orthodontics', 60, 'from', true),

  ('aparato-funcional-removible',
   'Aparato funcional removible', 'Removable Functional Appliance', 'Mobilna funkcionalna naprava',
   array['aparato funcional','functional appliance','funkcionalna naprava','activador','frankel'],
   'orthodontics', 45, 'from', true),

  ('disyuntor-palatino',
   'Disyuntor palatino / expansor', 'Palatal Expander', 'Nepčani ekspander',
   array['disyuntor','palatal expander','nepcani ekspander','expansion rapida paladar','hyrax','quad helix'],
   'orthodontics', 30, 'from', true),

  ('mantenedor-espacio',
   'Mantenedor de espacio', 'Space Maintainer', 'Održavač prostora',
   array['mantenedor espacio','space maintainer','odrzavac prostora','banda anillo','nance','lip bumper'],
   'orthodontics', 30, 'exact', true),

  ('ortodoncia-interceptiva',
   'Ortodoncia interceptiva', 'Interceptive Orthodontics', 'Interceptivna ortodoncija',
   array['ortodoncia interceptiva','interceptive orthodontics','interceptivna','maloclusión temprana','first phase ortho'],
   'orthodontics', 60, 'from', true),

  ('contencion-fija-lingueta',
   'Contención fija con lingueta', 'Fixed Lingual Retainer', 'Fiksni lingvalni retainer',
   array['retenedor fijo','fixed retainer','fiksni retainer','lingueta fija','wire retainer'],
   'orthodontics', 30, 'exact', true),

  ('stripping-ipr-ortodoncia',
   'Stripping / IPR interproximal', 'Interproximal Reduction (Stripping)', 'Interproksimalna redukcija',
   array['stripping','ipr','interproximal reduction','desgaste interproximal','separacion dientes'],
   'orthodontics', 20, 'exact', true),

  ('refinamiento-alineadores',
   'Refinamiento de alineadores', 'Aligner Refinement', 'Dotjerivanje alignera',
   array['refinamiento alineadores','aligner refinement','dotjerivanje alignera','nuevas etapas invisalign','correction alineadores'],
   'orthodontics', 30, 'from', true),

  ('acelerador-ortodoncia',
   'Acelerador de ortodoncia (vibración/micropunción)', 'Orthodontic Accelerator', 'Ortodontski akcelerator',
   array['acelerador ortodoncia','orthodontic accelerator','ortodontski akcelerator','vibracion ortodoncia','propel','acceledent'],
   'orthodontics', 20, 'from', true),

  ('aparato-herbst',
   'Aparato de Herbst', 'Herbst Appliance', 'Herbstov aparat',
   array['herbst','herbst appliance','herbstov aparat','clase ii fijo','corrector clase 2 fijo'],
   'orthodontics', 60, 'from', true),

  ('ancla-osea-ortodoncia',
   'Microimplante de anclaje ortodóncico (TAD)', 'Orthodontic Mini-Implant (TAD)', 'Mini-implantat za sidrište u ortodonciji',
   array['tad','microimplante ortodoncia','ancoraje esqueletico','ortodoncia microimplante','skeletal anchorage'],
   'orthodontics', 30, 'from', true),

  ('ortodoncia-adulto-completa',
   'Ortodoncia completa en adulto', 'Full Adult Orthodontic Treatment', 'Potpuni ortodontski tretman odrasli',
   array['ortodoncia adulto','adult orthodontics','ortodoncia completa adulto','tratamiento completo adulto'],
   'orthodontics', 75, 'from', true),

  ('contencion-removible',
   'Contención removible', 'Removable Retainer', 'Mobilni retainer',
   array['retenedor removible','removable retainer','mobilni retainer','hawley retainer','placa retencion'],
   'orthodontics', 20, 'exact', true),

  ('ortodoncia-cirugia-ortognatica',
   'Ortodoncia pré/post cirugía ortognática', 'Pre/Post Orthognathic Surgery Orthodontics', 'Ortodoncija prije/nakon ortognatske kirurgije',
   array['ortodoncia cirugia ortognatica','orthognathic orthodontics','ortodoncija ortognatska','presurgical ortho'],
   'orthodontics', 75, 'from', true),

-- ============================================================
-- PEDIATRIC — 18 new entries (existing: 1 → total: 19)
-- ============================================================

  ('revision-dental-infantil',
   'Revisión dental infantil', 'Pediatric Dental Checkup', 'Dječji dentalni pregled',
   array['revision nino','pediatric checkup','djecji pregled','primera visita nino','control dental infantil'],
   'pediatric', 30, 'consult', true),

  ('profilaxis-infantil',
   'Profilaxis dental infantil', 'Pediatric Prophylaxis', 'Dječja dentalna profilaksa',
   array['profilaxis nino','pediatric prophylaxis','djecja profilaksa','limpieza nino','higiene infantil'],
   'pediatric', 30, 'exact', true),

  ('sellado-molar-temporal',
   'Sellado de molar temporal', 'Primary Molar Sealant', 'Pečatiranje mliječnog molara',
   array['sellado molar temporal','primary molar sealant','mljecni molar pecatiranje','sellado diente leche'],
   'pediatric', 20, 'exact', true),

  ('sellado-molar-permanente-nino',
   'Sellado de molar permanente (niño)', 'Permanent Molar Sealant (Child)', 'Pečatiranje trajnog molara (dijete)',
   array['sellado primer molar','first molar sealant','pecatiranje trajnog molara','sellado 6 anos'],
   'pediatric', 20, 'exact', true),

  ('fluoruro-infantil-topico',
   'Flúor tópico infantil', 'Pediatric Topical Fluoride', 'Topikalni fluor za djecu',
   array['fluor nino','pediatric fluoride','fluor dijete','fluoruro topico infantil','prevencion caries nino'],
   'pediatric', 10, 'exact', true),

  ('corona-acero-inoxidable',
   'Corona de acero inoxidable (diente temporal)', 'Stainless Steel Crown (Primary Tooth)', 'Čelična krunica (mliječni zub)',
   array['corona acero nino','stainless steel crown','celicna krunica dijete','ssc','corona nino acero'],
   'pediatric', 45, 'exact', true),

  ('corona-resina-diente-temporal',
   'Corona de resina para diente temporal', 'Resin Crown for Primary Tooth', 'Kompozitna krunica za mliječni zub',
   array['corona resina nino','resin crown primary','kompozitna krunica mljecni','corona anterior nino'],
   'pediatric', 45, 'from', true),

  ('extraccion-diente-temporal',
   'Extracción de diente temporal', 'Primary Tooth Extraction', 'Vađenje mliječnog zuba',
   array['extraccion diente leche','primary tooth extraction','vadenje mljecnog zuba','sacar diente nino'],
   'pediatric', 20, 'exact', true),

  ('pulpotomia-infantil',
   'Pulpotomía infantil (diente temporal)', 'Pediatric Pulpotomy (Primary Tooth)', 'Dječja pulpotomija (mliječni zub)',
   array['pulpotomia nino','pediatric pulpotomy','djecja pulpotomija','nervio nino','pulpa temporal tratamiento'],
   'pediatric', 45, 'from', true),

  ('pulpectomia-infantil',
   'Pulpectomía infantil (diente temporal)', 'Pediatric Pulpectomy (Primary Tooth)', 'Dječja pulpektomija (mliječni zub)',
   array['pulpectomia nino','pediatric pulpectomy','djecja pulpektomija','conducto nino','canal nino'],
   'pediatric', 60, 'from', true),

  ('mantenedor-espacio-pediatrico',
   'Mantenedor de espacio (pediatría)', 'Pediatric Space Maintainer', 'Dječji održavač prostora',
   array['mantenedor espacio nino','pediatric space maintainer','djecji odrzavac','banda anillo nino'],
   'pediatric', 30, 'exact', true),

  ('tratamiento-habitos-orales',
   'Tratamiento de hábitos orales', 'Oral Habit Breaking Appliance', 'Naprava za prekidanje oralnih navika',
   array['habitos orales','habit appliance','oralne navike','chupar dedo','interposicion lingual'],
   'pediatric', 30, 'from', true),

  ('rehabilitacion-oral-infantil',
   'Rehabilitación oral infantil integral', 'Comprehensive Pediatric Oral Rehabilitation', 'Integralna dječja oralna rehabilitacija',
   array['rehab oral nino','pediatric rehabilitation','djecja rehabilitacija','boca completa nino','tratamiento integral nino'],
   'pediatric', 120, 'from', true),

  ('control-caries-infantil',
   'Control de caries infantil', 'Pediatric Caries Control', 'Kontrola dječjeg karijesa',
   array['caries nino','pediatric caries','djecji karijes','prevencion caries nino','early childhood caries'],
   'pediatric', 20, 'consult', true),

  ('traumatismo-dental-infantil',
   'Traumatismo dental infantil', 'Pediatric Dental Trauma', 'Dentalna trauma kod djece',
   array['trauma dental nino','dental trauma child','dentalna trauma djeca','diente roto nino','golpe diente nino'],
   'pediatric', 30, 'from', true),

  ('ortodoncia-temprana-interceptiva',
   'Ortodoncia temprana interceptiva', 'Early Interceptive Orthodontics', 'Rana interceptivna ortodoncija',
   array['ortodoncia temprana','early orthodontics','rana ortodoncija','maloclusión primera fase','fase 1 ortodoncia'],
   'pediatric', 45, 'from', true),

  ('evaluacion-desarrollo-dental',
   'Evaluación de desarrollo dental', 'Dental Development Evaluation', 'Procjena razvoja zubi',
   array['desarrollo dental','dental development','razvoj zubi','evaluacion erupcion','denticion mixta'],
   'pediatric', 20, 'consult', true),

  ('alta-dental-infantil',
   'Alta dental infantil (revisión anual)', 'Annual Pediatric Dental Recall', 'Godišnji dječji dentalni pregled',
   array['alta nino','pediatric recall','godisnji pregled dijete','revision anual nino','control anual infantil'],
   'pediatric', 20, 'exact', true),

-- ============================================================
-- PROSTHETICS — 18 new entries (existing: 7 → total: 25)
-- ============================================================

  ('corona-metal-porcelana',
   'Corona metal-porcelana', 'Metal-Ceramic Crown', 'Metal-keramička krunica',
   array['corona metal porcelana','metal ceramic crown','metal keramicka krunica','pfm','porcelain fused metal'],
   'prosthetics', 75, 'from', true),

  ('corona-metal-completa',
   'Corona de metal completa', 'Full Metal Crown', 'Potpuno metalna krunica',
   array['corona metal','full metal crown','metalna krunica','corona oro','colada metal'],
   'prosthetics', 75, 'from', true),

  ('corona-resina-provisional',
   'Corona de resina provisional', 'Provisional Resin Crown', 'Privremena kompozitna krunica',
   array['corona provisional','provisional crown','privremena krunica','temp crown','restauracion provisional fija'],
   'prosthetics', 45, 'from', true),

  ('corona-provisional-directa',
   'Corona provisional directa (boca)', 'Direct Chairside Provisional Crown', 'Direktna privremena krunica (u stolcu)',
   array['provisional directa','chairside provisional','provisional inmediata','corona provisoria directa'],
   'prosthetics', 30, 'from', true),

  ('puente-metal-porcelana',
   'Puente metal-porcelana', 'Metal-Ceramic Bridge', 'Metal-keramički most',
   array['puente metal porcelana','metal ceramic bridge','metal keramicki most','pfm bridge','puente pfm'],
   'prosthetics', 90, 'from', true),

  ('puente-zirconio',
   'Puente de zirconio', 'Zirconia Bridge', 'Cirkonski most',
   array['puente zirconio','zirconia bridge','cirkonski most','puente ceramico completo','full ceramic bridge'],
   'prosthetics', 90, 'from', true),

  ('protesis-parcial-removible-resina',
   'Prótesis parcial removible (resina)', 'Removable Partial Denture (Resin)', 'Djelomična proteza (akril)',
   array['protesis parcial resina','resin partial denture','akrilna parcijalna','parcial acrilica','protesis removible parcial'],
   'prosthetics', 60, 'from', true),

  ('protesis-parcial-esqueletica',
   'Prótesis parcial esquelética', 'Removable Partial Denture (Skeleton/Metal)', 'Skeletirani parcijalna proteza',
   array['esqueleto','skeleton denture','skeletirani','protesis metal removible','parcial esqueletica'],
   'prosthetics', 60, 'from', true),

  ('protesis-total-superior',
   'Prótesis total superior', 'Complete Upper Denture', 'Potpuna gornja proteza',
   array['dentadura superior','upper denture','gornja proteza','protesis completa superior','dentadura total arriba'],
   'prosthetics', 60, 'from', true),

  ('protesis-total-inferior',
   'Prótesis total inferior', 'Complete Lower Denture', 'Potpuna donja proteza',
   array['dentadura inferior','lower denture','donja proteza','protesis completa inferior','dentadura total abajo'],
   'prosthetics', 60, 'from', true),

  ('protesis-inmediata',
   'Prótesis inmediata post-extracción', 'Immediate Post-Extraction Denture', 'Neposredna proteza nakon ekstrakcije',
   array['protesis inmediata','immediate denture','neposredna proteza','dentadura misma dia extraccion'],
   'prosthetics', 45, 'from', true),

  ('sobredentadura-protesis',
   'Sobredentadura sobre dientes remanentes', 'Tooth-Supported Overdenture', 'Proteza na preostalim zubima',
   array['sobredentadura','overdenture','proteza na zubima','dentadura sobre dientes','retencion dientes propios'],
   'prosthetics', 60, 'from', true),

  ('carilla-composite-directo',
   'Carilla de composite directo', 'Direct Composite Veneer', 'Direktna kompozitna ljuskica',
   array['carilla composite','composite veneer','kompozitna ljuskica','faceta directa','carilla directa'],
   'prosthetics', 60, 'from', true),

  ('lamina-ceramica-ultrafina',
   'Lámina cerámica ultrafina (no prep)', 'Ultra-Thin Ceramic Laminate (No-Prep)', 'Ultra tanka keramička ljuskica',
   array['lamina ultrafina','no prep veneer','ultra thin veneer','laminado no prep','lumineers','emax laminate'],
   'prosthetics', 90, 'from', true),

  ('restauracion-emax',
   'Restauración e.max (disilicato de litio)', 'e.max Restoration (Lithium Disilicate)', 'E.max restauracija (litijeva disilika)',
   array['emax','e.max','lithium disilicate','disilicato litio','corona emax','restauracion disilicato'],
   'prosthetics', 90, 'from', true),

  ('incrustacion-metal-colado',
   'Incrustación de metal colado', 'Cast Metal Inlay', 'Lijevani metalni inlay',
   array['inlay metal colado','cast metal inlay','lijevani metal','incrustacion metal','inlay oro colado'],
   'prosthetics', 90, 'from', true),

  ('rebase-protesis-removible',
   'Rebase de prótesis removible', 'Denture Relining', 'Rebasiranje proteze',
   array['rebase protesis','denture reline','rebasiranje','reajuste protesis','adaptacion protesis'],
   'prosthetics', 45, 'from', true),

  ('reparacion-fractura-protesis',
   'Reparación de fractura de prótesis', 'Denture Fracture Repair', 'Popravak slomljene proteze',
   array['reparacion protesis fractura','denture repair broken','popravak slomljene proteze','protesis rota'],
   'prosthetics', 45, 'from', true),

-- ============================================================
-- ANESTHESIA — 7 new entries (existing: 1 → total: 8)
-- ============================================================

  ('sedacion-consciente',
   'Sedación consciente (IV / oral)', 'Conscious Sedation', 'Svjesna sedacija',
   array['sedacion consciente','conscious sedation','svjesna sedacija','sedacion moderada','ansiedad dental sedacion'],
   'anesthesia', 30, 'consult', true),

  ('sedacion-inhalatoria-n2o',
   'Sedación inhalatoria con óxido nitroso', 'Nitrous Oxide Inhalation Sedation', 'Inhalacijska sedacija dušičnim oksidom',
   array['oxido nitroso','nitrous oxide','n2o','gas hilarante','sedacion gas dental'],
   'anesthesia', 20, 'from', true),

  ('anestesia-troncular',
   'Anestesia troncular (bloqueo nervioso)', 'Nerve Block Anesthesia', 'Blok anestezija živca',
   array['anestesia troncular','nerve block','blok anestezija','bloqueo mandibular','anestesia inferior'],
   'anesthesia', 10, 'exact', true),

  ('anestesia-infiltrativa-local',
   'Anestesia infiltrativa local', 'Local Infiltration Anesthesia', 'Lokalna infiltracijska anestezija',
   array['anestesia infiltrativa','local infiltration','lokalna anestezija','anestesia local','lidocaina'],
   'anesthesia', 10, 'exact', true),

  ('anestesia-intraligamentaria',
   'Anestesia intraligamentaria', 'Intraligamental Anesthesia', 'Intraligamentarna anestezija',
   array['anestesia intraligamentaria','intraligamental','intraligamentarna','psl','periodontal ligament injection'],
   'anesthesia', 10, 'exact', true),

  ('anestesia-topica',
   'Anestesia tópica', 'Topical Anesthesia', 'Topikalna anestezija',
   array['anestesia topica','topical anesthetic','topikalna anestezija','gel anestesico','crema anestesia'],
   'anesthesia', 5, 'exact', true),

  ('premedicacion-ansiolitica',
   'Premedicación ansiolítica', 'Anxiolytic Premedication', 'Anksiolitička premedikacija',
   array['premedicacion','anxiolytic premedication','anksiolitik','triazolam dental','midazolam oral'],
   'anesthesia', 15, 'consult', true),

-- ============================================================
-- OTHER — 29 new entries (existing: 2 → total: 31)
-- Covers: cosmetic, TMJ/occlusion, emergency, oral pathology, maintenance
-- ============================================================

-- Cosmetic / Aesthetic
  ('diseno-sonrisa-digital',
   'Diseño de sonrisa digital', 'Digital Smile Design', 'Digitalni dizajn osmijeha',
   array['diseno sonrisa','smile design','digitalni osmijeh','dsd','planificacion estetica digital'],
   'other', 45, 'consult', true),

  ('mock-up-dental',
   'Mock-up dental diagnóstico', 'Diagnostic Dental Mock-Up', 'Dijagnostički dentalni mock-up',
   array['mock up dental','dental mockup','probni osmijeh','prueba sonrisa','previsualización estetica'],
   'other', 30, 'from', true),

  ('blanqueamiento-interno-no-vital',
   'Blanqueamiento interno (diente no vital)', 'Internal Tooth Whitening (Non-Vital)', 'Unutarnje izbjeljivanje (nevitalni zub)',
   array['blanqueamiento interno','internal whitening','unutarnje izbjeljivanje','walking bleach','diente endodonciado manchado'],
   'other', 30, 'from', true),

  ('blanqueamiento-laser-led',
   'Blanqueamiento con láser / LED', 'Laser/LED Teeth Whitening', 'Lasersko/LED izbjeljivanje zuba',
   array['blanqueamiento laser','laser whitening','lasersko izbjeljivanje','zoom whitening','led whitening','blanqueamiento luz'],
   'other', 60, 'from', true),

  ('microabrasion-esmalte',
   'Microabrasión de esmalte', 'Enamel Microabrasion', 'Mikroabrazija cakline',
   array['microabrasion','enamel microabrasion','mikroabrazija','manchas blancas esmalte','fluorosis estetica'],
   'other', 30, 'from', true),

  ('contorneado-gingival-estetico',
   'Contorneado gingival estético', 'Aesthetic Gingival Contouring', 'Estetsko oblikovanje gingive',
   array['contorneado gingival','gingival contouring','oblikovanje gingive','laser encia estetica','remodelado gingival estetico'],
   'other', 30, 'from', true),

  ('alargamiento-dientes-estetico',
   'Alargamiento estético de dientes cortos', 'Aesthetic Tooth Lengthening', 'Estetsko produljenje kratkih zuba',
   array['dientes cortos','short teeth lengthening','kratki zubi','coronas cortas estetica','gingivectomia estetica'],
   'other', 60, 'from', true),

  ('composite-estetico-frente-completo',
   'Composite estético frente completo', 'Full Anterior Aesthetic Composite', 'Potpuni estetski kompozit prednjih zuba',
   array['composite frente completo','full anterior composite','kompletni estetski kompozit','rehabilitacion estetica composite'],
   'other', 180, 'from', true),

  ('carilla-composite-sonrisa',
   'Carillas de composite (sonrisa completa)', 'Composite Veneers (Full Smile)', 'Kompozitne ljuskice (cijeli osmijeh)',
   array['carillas composite sonrisa','full smile composite','kompozitne ljuskice osmijeh','composite veneers smile'],
   'other', 150, 'from', true),

-- TMJ / Occlusion
  ('ferula-michigan',
   'Férula de Michigan (rigida)', 'Michigan Splint (Rigid)', 'Michiganska udlaga (rigidna)',
   array['ferula michigan','michigan splint','michiganska udlaga','gotiera michigan','placa dura bruxismo','ferula rigida'],
   'other', 45, 'from', true),

  ('ferula-nti-tension',
   'Férula NTI-tss', 'NTI-tss Splint', 'NTI-tss udlaga',
   array['ferula nti','nti splint','nti udlaga','anterior bite stop','ferula anterior'],
   'other', 30, 'from', true),

  ('gotiera-repositora-atm',
   'Gotera repositora de ATM', 'TMJ Repositioning Splint', 'Repozicijska udlaga TMZ',
   array['gotiera repositora','repositioning splint','repozicijska udlaga','atm repositionamiento','disc recapture splint'],
   'other', 45, 'from', true),

  ('terapia-atm-conservadora',
   'Terapia conservadora de ATM', 'Conservative TMJ Therapy', 'Konzervativna terapija TMZ',
   array['terapia atm','tmj therapy','terapija tmz','articulacion temporomandibular tratamiento','dolor mandibular'],
   'other', 30, 'consult', true),

  ('educacion-higiene-atm',
   'Educación al paciente sobre ATM', 'TMJ Patient Education', 'Edukacija pacijenta o TMZ',
   array['educacion atm','tmj education','edukacija tmz','ejercicios mandibula','automasaje atm'],
   'other', 20, 'consult', true),

  ('infiltracion-atm',
   'Infiltración articular de ATM', 'TMJ Intra-articular Injection', 'Intra-articularna injekcija TMZ',
   array['infiltracion atm','tmj injection','injekcija tmz','artrocentesis','plasma rico atm','acido hialuronico atm'],
   'other', 30, 'from', true),

  ('terapia-mio-facial',
   'Terapia mio-facial / fisioterapia oral', 'Myofacial / Oral Physiotherapy', 'Miofacijalna terapija',
   array['fisioterapia oral','myofascial therapy','miofacijalna','tens dental','ultrasonidos atm','ejercicios musculares mandibula'],
   'other', 45, 'from', true),

-- Emergency dentistry
  ('urgencia-dolor-dental-agudo',
   'Urgencia por dolor dental agudo', 'Acute Dental Pain Emergency', 'Hitno: akutna dentalna bol',
   array['urgencia dolor','acute pain emergency','hitno bol zub','dolor insoportable diente','dolor agudo dental'],
   'other', 30, 'consult', true),

  ('urgencia-avulsion-dental',
   'Urgencia: avulsión dental', 'Dental Avulsion Emergency', 'Hitno: avulzija zuba',
   array['avulsion dental','tooth avulsion','avulzija zuba','diente arrancado','reimplantacion urgente','diente caido golpe'],
   'other', 30, 'from', true),

  ('urgencia-trauma-dentofacial',
   'Urgencia: traumatismo dentofacial', 'Dentofacial Trauma Emergency', 'Hitno: dentofacijalna trauma',
   array['trauma dentofacial','dental trauma emergency','trauma zub lice','fractura dental accidente','golpe dientes cara'],
   'other', 30, 'from', true),

  ('urgencia-corona-fracturada',
   'Urgencia: corona fracturada', 'Fractured Crown Emergency', 'Hitno: slomljena krunica',
   array['corona rota','crown fracture','slomljena krunica','fractura corona urgencia','diente roto urgente'],
   'other', 30, 'from', true),

  ('urgencia-hemorragia-postextraccion',
   'Urgencia: hemorragia post-extracción', 'Post-Extraction Hemorrhage Emergency', 'Hitno: krvarenje nakon vađenja',
   array['hemorragia extraccion','post extraction bleeding','krvarenje vadenje','sangrado tras extraccion'],
   'other', 20, 'from', true),

  ('urgencia-infeccion-dental-aguda',
   'Urgencia: infección dental aguda', 'Acute Dental Infection Emergency', 'Hitno: akutna dentalna infekcija',
   array['infeccion dental urgente','acute dental infection','akutna infekcija zuba','absceso urgente','hinchazón facial infeccion'],
   'other', 30, 'from', true),

-- Oral pathology
  ('tratamiento-aftas',
   'Tratamiento de aftas orales', 'Aphthous Ulcer Treatment', 'Liječenje afti',
   array['aftas','aftas orales','aphthous ulcer','ulceras bucales','ljecenje afti','estomatitis aftas'],
   'other', 15, 'exact', true),

  ('tratamiento-herpes-labial',
   'Tratamiento de herpes labial', 'Herpes Labialis Treatment', 'Liječenje herpesa usana',
   array['herpes labial','cold sore','herpes usana','labial herpes','afta labial viral'],
   'other', 15, 'exact', true),

  ('tratamiento-xerostomia',
   'Tratamiento de xerostomía (boca seca)', 'Xerostomia (Dry Mouth) Treatment', 'Liječenje kserostomije',
   array['xerostomia','dry mouth','kserostomija','boca seca','hiposialia'],
   'other', 20, 'consult', true),

  ('examen-patologia-oral',
   'Examen de patología oral', 'Oral Pathology Examination', 'Pregled oralne patologije',
   array['patologia oral','oral pathology','oralna patologija','lesion oral examen','lesion mucosa oral'],
   'other', 20, 'consult', true),

-- Post-operative / Maintenance
  ('control-postoperatorio-cirugia',
   'Control postoperatorio de cirugía', 'Post-Surgical Checkup', 'Postoperativni pregled',
   array['control postoperatorio','post op','postoperativni','revision cirugia','seguimiento cirugia oral'],
   'other', 15, 'exact', true),

  ('retiro-suturas',
   'Retirada de suturas', 'Suture Removal', 'Vađenje šavova',
   array['retiro puntos','suture removal','vadenje savova','quitar puntos','puntos cirugia'],
   'other', 10, 'exact', true),

  ('control-protesis-nueva',
   'Control de adaptación de prótesis nueva', 'New Denture Adaptation Checkup', 'Kontrolni pregled prilagodbe nove proteze',
   array['control protesis','denture adaptation check','kontrola proteze','revision dentadura nueva','ajuste protesis'],
   'other', 20, 'exact', true)

on conflict (slug) do nothing;
