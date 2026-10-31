BEGIN;

INSERT INTO public.prescription_medicines (
  generic_name,
  brand_name,
  strength,
  dosage_form,
  approval_status,
  is_active,
  submitted_by
)
SELECT
  seed.generic_name,
  seed.brand_name,
  seed.strength,
  seed.dosage_form,
  'PENDING',
  false,
  NULL
FROM (
  VALUES
    ('Amoxicillin', 'Amoksisilin', '500 mg', 'kapsul'),
    ('Amoxicillin + Clavulanic acid', 'Co-amoxiclav; Augmentin', '625 mg', 'tablet'),
    ('Clindamycin', 'Dalacin C', '300 mg', 'kapsul'),
    ('Metronidazole', 'Flagyl', '500 mg', 'tablet'),
    ('Azithromycin', 'Zithromax', '500 mg', 'tablet'),
    ('Cefadroxil', 'Duricef', '500 mg', 'kapsul'),
    ('Doxycycline', 'Doksisiklin', '100 mg', 'kapsul'),
    ('Paracetamol', 'Parasetamol; Sanmol; Panadol', '500 mg', 'tablet'),
    ('Asam mefenamat', 'Ponstan; Mefinal', '500 mg', 'tablet'),
    ('Ibuprofen', 'Proris; Brufen', '400 mg', 'tablet'),
    ('Natrium diklofenak', 'Voltaren; Cataflam', '50 mg', 'tablet'),
    ('Ketorolac', 'Ketorolac tromethamine; Toradol', '10 mg', 'tablet'),
    ('Meloxicam', 'Mobic', '15 mg', 'tablet'),
    ('Dexamethasone', 'Dexametason', '0,5 mg', 'tablet'),
    ('Methylprednisolone', 'Metilprednisolon; Medrol', '4 mg', 'tablet'),
    ('Asam traneksamat', 'Transamin; Tranexamic acid', '500 mg', 'tablet'),
    ('Omeprazole', 'Omeprazol', '20 mg', 'kapsul'),
    ('Lansoprazole', 'Prosogan', '30 mg', 'kapsul'),
    ('Nystatin', 'Mycostatin; Nistatin', '100.000 IU/mL', 'drops'),
    ('Miconazole oral gel', 'Daktarin oral gel', '2%', 'gel'),
    ('Fluconazole', 'Diflucan; Fluconazol', '150 mg', 'kapsul'),
    ('Acyclovir', 'Aciclovir; Zovirax', '200 mg', 'tablet'),
    ('Acyclovir cream', 'Zovirax cream', '5%', 'krim'),
    ('Chlorhexidine gluconate', 'Minosep; Chlorhexidine', '0,2%', 'obat kumur'),
    ('Povidone iodine', 'Betadine gargle; Betadine kumur', '1%', 'obat kumur'),
    ('Benzydamine HCl', 'Tantum Verde', '0,15%', 'obat kumur'),
    ('Triamcinolone acetonide in orabase', 'Kenalog in orabase; Orabase TA', '0,1%', 'pasta oral'),
    ('Cetirizine', 'Cetirizin; Incidal', '10 mg', 'tablet'),
    ('Loratadine', 'Claritin; Loratadin', '10 mg', 'tablet'),
    ('Chlorpheniramine maleate (CTM)', 'CTM; Klorfeniramin', '4 mg', 'tablet'),
    ('Vitamin B complex', 'Neurobion; Vitamin B kompleks', '-', 'tablet'),
    ('Vitamin C', 'Asam askorbat; Redoxon', '500 mg', 'tablet')
) AS seed(generic_name, brand_name, strength, dosage_form)
WHERE NOT EXISTS (
  SELECT 1
  FROM public.prescription_medicines existing
  WHERE LOWER(BTRIM(existing.generic_name)) = LOWER(BTRIM(seed.generic_name))
    AND LOWER(BTRIM(existing.brand_name)) = LOWER(BTRIM(seed.brand_name))
    AND LOWER(BTRIM(existing.strength)) = LOWER(BTRIM(seed.strength))
    AND LOWER(BTRIM(existing.dosage_form)) = LOWER(BTRIM(seed.dosage_form))
);

COMMIT;
