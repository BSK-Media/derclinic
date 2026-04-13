import { PrismaClient, Role, ProductCategory, UnitType } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const SERVICES: Array<{ name: string; price: number }> = [
  { name: 'PAKIET konsultacja+USG jamy brzusznej+USG tarczycy', price: 750 },
  { name: 'Kolejna wizyta- leczenie otyłości', price: 300 },
  { name: 'Konsultacja obesitologiczna + USG jamy brzusznej', price: 650 },
  { name: 'Konsultacja obesitologiczna + USG tarczycy', price: 650 },
  { name: 'USG tarczycy', price: 250 },
  { name: 'USG jamy brzusznej', price: 250 },
  { name: 'Konsultacja obesitologiczna (leczenie otyłości)', price: 500 },
  { name: 'Recepcja', price: 0 },
  { name: 'Relaksacyjny masaż całego ciała', price: 180 },
  { name: 'Relaksacyjny masaż pleców', price: 140 },
  { name: 'Lipotransfer - powiększenie penisa', price: 11000 },
  { name: 'Konsultacja kobiet w ciąży', price: 350 },
  { name: 'Konsultacja ginekologiczna', price: 250 },
  { name: 'Leczenie wysiłkowego nietrzymania moczu', price: 1200 },
  { name: 'Leczenie pochwicy toksyna botulinową', price: 1700 },
  { name: 'Nadpotliwość okolic pachwin i sromu', price: 1700 },
  { name: 'Labioplastyka', price: 4500 },
  { name: 'Augumentacja punktu G', price: 1400 },
  { name: 'Rewitalizacja pochwy PRP', price: 1300 },
  { name: 'Uwrażliwienie łechtaczki kwasem hialuronowym', price: 1300 },
  { name: 'Założenie wkładki niehormonalnej', price: 900 },
  { name: 'Założenie wkładki hormonalnej', price: 1700 },
  { name: 'USG wczesna ciąża', price: 300 },
  { name: 'USG ginekologiczne', price: 250 },
  { name: 'Konsultacja ginekologiczna + usg', price: 400 },
  { name: 'Cytologia płynna + HPV', price: 270 },
  { name: 'Cytologia ginekologiczna', price: 80 },
  { name: 'Cytologia jednowarstwowa LBC (płynna cytologia)', price: 150 },
  { name: 'Konsultacja z dermatoskopią u Dr Aliny', price: 430 },
  { name: 'Konsultacja dermatologiczna u Dr Aliny', price: 380 },
  { name: 'Bandaże AROSHA + presoterapia', price: 400 },
  { name: 'Bandaże Arosha No Drain - terapia drenująca', price: 350 },
  { name: 'Bandaże Arosha lift plus - ujędrnienie i napięcie', price: 350 },
  { name: 'Bandaż Arosha + Masaż Antycellulitowy', price: 490 },
  { name: 'Masaż relaksacyjny twarzy, szyi i dekoltu', price: 150 },
  { name: 'Antycellulitowy rytuał SPA', price: 220 },
  { name: 'Japoński rytuał młodości masaż KOBIDO + PEELING', price: 320 },
  { name: 'Pakiet 10 zabiegów masaż MADERO', price: 1600 },
  { name: 'Masaż kobido - niechirurgiczny masaż liftingujący', price: 220 },
  { name: 'Tapping twarzy', price: 80 },
  { name: 'Masaż MADERO - brazylijski antycellulitowy', price: 180 },
  { name: 'Manualny drenaż limfatyczny', price: 200 },
  { name: 'Masaż karku i głowy', price: 100 },
  { name: 'Konsultacja flebologiczna', price: 250 },
  { name: 'Laserowe usuwanie żylaków - 2 nogi', price: 7000 },
  { name: 'Laserowe usuwanie żylaków - 1 noga', price: 5000 },
  { name: 'Miniflebektomia', price: 2000 },
  { name: 'Skleroterapia', price: 1100 },
  { name: 'Konsultacja + usg doppler kończyn-żył lub tetnic', price: 500 },
  { name: 'Konsultacja + usg aorty brzusznej i tętnic', price: 400 },
  { name: 'Lifting nićmi APTOS®', price: 3500 },
  { name: 'Modelowanie ust', price: 1150 },
  { name: 'Modelowanie ust "na płasko"', price: 1300 },
  { name: 'Teosyal Redensity II', price: 1400 },
  { name: 'Teosyal RHA4 - 2 ampułki', price: 3300 },
  { name: 'Teosyal RHA4 - 1 ampułka', price: 1800 },
  { name: 'Teosyal RHA3 - 2 ampułki', price: 3000 },
  { name: 'Teosyal RHA3 - 1 ampułka', price: 1600 },
  { name: 'Teosyal RHA2 - 2 ampułki', price: 2700 },
  { name: 'Teosyal RHA2 - 1 ampułka', price: 1400 },
  { name: 'Teosyal Ultradeep - 2 ampullki', price: 3300 },
  { name: 'Teosyal Ultradeep - 1 ampułka', price: 1700 },
  { name: 'Kwas hialuronowy - wypełnienie / modelowanie - 3 ampułki', price: 3100 },
  { name: 'Kwas hialuronowy - wypełnienie / modelowanie - 1 ampułka', price: 1200 },
  { name: 'Kwas hialuronowy - wypełnienie / modelowanie - 2 ampułki', price: 2200 },
  { name: 'Nowość! GOURI PCL ( polikaprolakton) - 1ml', price: 2000 },
  { name: 'Kwas polimlekowy lanluma - Twarz, szyja i dekolt', price: 3500 },
  { name: 'Kwas polimlekowy lanluma - Twarz + szyja', price: 2875 },
  { name: 'Kwas polimlekowy lanluma - Twarz', price: 2200 },
  { name: 'Kwas polimlekowy lanluma - Modelowanie pośladków', price: 4500 },
  { name: 'Peeling fenolowy na twarz', price: 650 },
  { name: 'Mezobotox', price: 1500 },
  { name: 'Nowość! Toksynaa Relfydess - 3 okolice', price: 2300 },
  { name: 'Nowość! Toksynaa Relfydess - 2 okolice', price: 1500 },
  { name: 'Nowość! Toksynaa Relfydess - 1 okolica', price: 800 },
  { name: 'Konsultacja dermatologiczna', price: 300 },
  { name: 'Konsultacja lekarza medycyny estetycznej', price: 250 },
  { name: 'Dermapen stymulacja wzrostu włosów', price: 900 },
  { name: 'Konsultacja trychologiczna', price: 350 },
  { name: 'Dudasteryd - leczenie łysienia androgenowego', price: 900 },
  { name: 'Nadpotliwość pachy / dłonie / stopy', price: 1500 },
  { name: 'Toksyna botulinowa BOTOX - Leczenie migreny', price: 3500 },
  { name: 'Toksyna botulinowa BOTOX - Zwężenie płatków nosa / podniesienie czubka nosa', price: 900 },
  { name: 'Toksyna botulinowa BOTOX - Lifting brwi', price: 1900 },
  { name: 'Toksyna botulinowa BOTOX - 4 okolice', price: 1900 },
  { name: 'Toksyna botulinowa BOTOX - 1 okolica', price: 600 },
  { name: 'Toksyna botulinowa BOTOX - Redukcja uśmiechu dziąsłowego', price: 600 },
  { name: 'Toksyna botulinowa BOTOX - Bruksizm', price: 1400 },
  { name: 'Toksyna botulinowa BOTOX - Lip flip / broda brukowana / uniesienie kącika ust', price: 600 },
  { name: 'Toksyna botulinowa BOTOX - FULL FACE', price: 3900 },
  { name: 'Toksyna botulinowa BOTOX - 2 okolice', price: 1100 },
  { name: 'Toksyna botulinowa BOTOX - 3 okolice', price: 1500 },
  { name: 'Nacięcie i drenaż ropnia', price: 650 },
  { name: 'Leczenie ran przewlekłych wraz z konsultacją lek.', price: 900 },
  { name: 'Leczenie ran przewlekłych - opracowanie rany', price: 500 },
  { name: 'Badanie histopatologiczne*', price: 150 },
  { name: 'Konsultacja chirurgiczna', price: 250 },
  { name: 'Chirurgiczne usunięcie zmiany skórnej - 5-7 zmian', price: 1500 },
  { name: 'Chirurgiczne usunięcie zmiany skórnej - 2-4 zmiany', price: 900 },
  { name: 'Chirurgiczne usunięcie zmiany skórnej - 1 zmiana', price: 700 },
  { name: 'Laserowe usunięcie zmian skórnych - >6 zmian na twarzy', price: 1000 },
  { name: 'Laserowe usunięcie zmian skórnych - 4-6 zmian na twarzy', price: 850 },
  { name: 'Laserowe usunięcie zmian skórnych - 1-3 zmian na twarzy', price: 750 },
  { name: 'Biopsja z założeniem szwu chirurgicznego', price: 900 },
  { name: 'Chirurgiczne usunięcie nowotworu z plastyka miejscową', price: 1300 },
  { name: 'Chirurgiczne usunięcie nowotworu skóry', price: 950 },
  { name: 'Usuwanie zmian w okolicy oczu', price: 400 },
  { name: 'Usunięcie kępek żółtych', price: 1500 },
  { name: 'Kontrola', price: 0 },
  { name: 'Icoone drenaż limfatyczny - 3 obszary pakiet 10 zabiegów', price: 2800 },
  { name: 'Icoone drenaż limfatyczny - 3 obszary', price: 300 },
  { name: 'Icoone drenaż limfatyczny - 2 obszary pakiet 10 zabiegów', price: 2300 },
  { name: 'Icoone drenaż limfatyczny - 2 obszary', price: 250 },
  { name: 'Icoone drenaż limfatyczny - 1 obszar pakiet 10 zabiegów', price: 2000 },
  { name: 'Icoone drenaż limfatyczny - 1 obszar', price: 220 },
  { name: 'Icoone drenaż limfatyczny - pakiet 10 zabiegów', price: 1600 },
  { name: 'Icoone na twarz (intensywny drenaż liftingujący)', price: 190 },
  { name: 'ACNE Rescue Treatment', price: 500 },
  { name: 'PRO XN Zabieg rozświetlający BrightUp', price: 600 },
  { name: 'Ksantohumol Recovery Treatment do zabiegu', price: 450 },
  { name: 'PRO XN® Przeciwstarzeniowy III stopień + Dermapen', price: 1050 },
  { name: 'PRO XN® Przeciwstarzeniowy I stopień', price: 500 },
  { name: 'PRO XN® Przeciwstarzeniowy II stopień z retinolem', price: 600 },
  { name: 'Dodatek - drenaż limfatyczny na nogi', price: 70 },
  { name: 'Dodatek - Henna brwi + regulacja', price: 90 },
  { name: 'Dodatek - Wapozon (otworzenie porów)', price: 100 },
  { name: 'Dodatek - egzosomy Supernova', price: 450 },
  { name: 'Dodatek - Oczyszczanie manualne', price: 50 },
  { name: 'Dodatek - Regulacja brwi/wąsik/broda', price: 40 },
  { name: 'Dodatek - Peeling kawitacyjny', price: 120 },
  { name: 'Dodatek - Mikrodermabrazja korundowa do', price: 150 },
  { name: 'Dodatek - Hydrafacial wstęp do zabiegu', price: 250 },
  { name: 'Dodatek - Ampułka', price: 50 },
  { name: 'Dodatek - Peeling chemiczny', price: 50 },
  { name: 'Dodatek - Maska algowa', price: 50 },
  { name: 'Dodatek - Darsonwal jedna okolica', price: 80 },
  { name: 'Męski rytuał pielęgnacyjny', price: 270 },
  { name: 'Henna brwi', price: 70 },
  { name: 'Komplet henna rzęsy + brwi', price: 150 },
  { name: 'Henna rzęs', price: 60 },
  { name: 'Medyczny peeling skóry głowy', price: 220 },
  { name: 'Laserowe zamykanie naczynka - powyżej 3', price: 350 },
  { name: 'Laserowe zamykanie naczynka - jedno naczynko', price: 150 },
  { name: 'Henna pudrowa + regulacja brwi', price: 90 },
  { name: 'Regulacja Brwi', price: 40 },
  { name: 'Makijaż permanentny ust', price: 1500 },
  { name: 'Makijaż permanentny brwi', price: 1500 },
  { name: 'Konsultacja z kwalifikacją', price: 200 },
  { name: 'ScarInk Mikronakłuwanie', price: 900 },
  { name: 'Micropeel', price: 1200 },
  { name: 'Supernova Nebula ACTO2 10%', price: 450 },
  { name: 'Terapia blizny - Dr Pen + egzosomy', price: 700 },
  { name: 'Terapia blizn - Dr Pen + peeling chemiczny Twarz', price: 450 },
  { name: 'Odmładzanie z mikronakłuwaniem - twarz + szyja + dekolt', price: 600 },
  { name: 'Odmładzanie z mikronakłuwaniem - twarz + szyja', price: 500 },
  { name: 'Dr Pen okolica oczu + peeling', price: 200 },
  { name: 'Dermapen z kwasem tranexamowym (twarz, szyja, dekolt)', price: 1400 },
  { name: 'Dermapen z kwasem tranexamowym (twarz, szyja)', price: 1200 },
  { name: 'Dermapen z kwasem tranexamowym (twarz)', price: 1000 },
  { name: 'Dermapen + egzosomy (twarz)', price: 1200 },
  { name: 'Dermapen + egzosomy (twarz, szyja, dekolt)', price: 1600 },
  { name: 'Dermapen + egzosomy (twarz,szyja)', price: 1400 },
  { name: 'DERMAPEN 4.0 + Jalupro twarz, szyja', price: 1350 },
  { name: 'DERMAPEN 4.0 + Jalupro twarz, szyja, dekolt', price: 1500 },
  { name: 'DERMAPEN 4.0 + Jalupro twarz', price: 1200 },
  { name: 'Dermapen 4.0 + osocze bogatopłytkowe (twarz + szyja + dekolt + oczy)', price: 1200 },
  { name: 'Dermapen 4.0® + medyczny peeling chemiczny - twarz + szyja + dekolt', price: 940 },
  { name: 'Dermapen 4.0® + medyczny peeling chemiczny - twarz + szyja', price: 890 },
  { name: 'Dermapen 4.0® + medyczny peeling chemiczny - twarz', price: 850 },
  { name: 'Dermapen 4.0® - twarz+ szyja + dekolt+ koktaajl filorga NCTF', price: 890 },
  { name: 'Dermapen 4.0® - twarz + szyja+ koktaajl filorga NCTF', price: 840 },
  { name: 'Dermapen 4.0® - cała twarz + koktaajl filorga NCTF', price: 790 },
  { name: 'Dermapen 4.0® - okolice oczu+ koktaajl filorga NCTF', price: 520 },
  { name: 'Konsultacja kosmetologiczna', price: 150 },
  { name: 'Pakiet 3 zabiegi RF twarz', price: 2200 },
  { name: 'Pakiet 3 zabiegi RF twarz + szyja dekolt', price: 3600 },
  { name: 'Pakiet 3 zabiegi RF okolica oczu', price: 800 },
  { name: 'RF Radiofrekwencja mikroigłowa - twarz + szyja + dekolt', price: 1500 },
  { name: 'RF Radiofrekwencja mikroigłowa - twarz', price: 800 },
  { name: 'RF Radiofrekwencja mikroigłowa - szyja', price: 500 },
  { name: 'RF Radiofrekwencja mikroigłowa - Okolica oczu', price: 300 },
  { name: 'RF Radiofrekwencja mikroigłowa - twarz + szyja', price: 1200 },
  { name: 'Mezoterapia Neuvia HYDRO de lux Twarz+szyja 2,5ml', price: 950 },
  { name: 'Stymulator tkankowy Pluryal Silk u lekarzy', price: 1400 },
  { name: 'Stymulator tkankowy Pluryal Silk u P. Magdy', price: 1300 },
  { name: 'NANOSOFT EYES BOOSTERS', price: 550 },
  { name: 'NCTF135 HA Filorga', price: 650 },
  { name: 'TwAc EYES', price: 900 },
  { name: 'Xela Rederm 1,1% - 2 ampułki', price: 1700 },
  { name: 'Xela Rederm 1,1% - 1 ampułka', price: 950 },
  { name: 'Xela Rederm 2,2% - 2 ampułki', price: 2200 },
  { name: 'Xela Rederm 2,2% - 1 ampułka', price: 1300 },
  { name: 'SUNEKOS 1200', price: 1500 },
  { name: 'Stymulator tkankowy Jalupro Young Eye®', price: 900 },
  { name: 'Fibryna bogatopłytkowa - Więcej niż 1 okolica', price: 1300 },
  { name: 'Fibryna bogatopłytkowa - 1 okolica', price: 850 },
  { name: 'Jalupro mezoterapia aminokwasami - Jalupro Classic® 3 ampułki', price: 1900 },
  { name: 'Jalupro mezoterapia aminokwasami - Jalupro Classic® 2 ampułki', price: 1400 },
  { name: 'Jalupro mezoterapia aminokwasami - Jalupro Classic® 1 ampułka', price: 900 },
  { name: 'Sunekos 200', price: 1000 },
  { name: 'Dr Cyj - Hair Filler', price: 850 },
  { name: 'Osocze bogatopłytkowe PRP - Twarz', price: 700 },
  { name: 'Osocze bogatopłytkowe PRP - Skóra głowy', price: 750 },
  { name: 'Osocze bogatopłytkowe PRP - Twarz + szyja + dekolt', price: 900 },
  { name: 'Osocze bogatopłytkowe PRP - Wybrany obszar', price: 600 },
  { name: 'Osocze bogatopłytkowe PRP - Twarz + szyja', price: 800 },
  { name: 'Mezoterapia mezokoktajlami - Twarz + szyja + dekolt', price: 950 },
  { name: 'Mezoterapia mezokoktajlami - Twarz + szyja', price: 750 },
  { name: 'Mezoterapia mezokoktajlami - Skóra głowy', price: 600 },
  { name: 'Mezoterapia mezokoktajlami - Twarz', price: 650 },
  { name: 'Mezoterapia mezokoktajlami - Wybrany obszar', price: 500 },
  { name: 'Mezoterapia mezokoktajlami - okolice oczu', price: 500 },
  { name: 'Lipoliza iniekcyjna - 1 amp', price: 500 },
  { name: 'MedEstelle COSMO S-PEEL Vit. C twarz + szyja + dekolt', price: 400 },
  { name: 'MedEstelle COSMO S-PEEL Vit. C twarz + szyja', price: 300 },
  { name: 'MedEstelle COSMO S-PEEL Vit. C twarz', price: 250 },
  { name: 'MedEstelle Senso Super Hydra Premium twarz + szyja + dekolt', price: 450 },
  { name: 'MedEstelle Senso Super Hydra Premium twarz + szyja', price: 400 },
  { name: 'MedEstelle Senso Super Hydra Premium twarz', price: 350 },
  { name: 'MedEstelle Redness Senso Calm Premium twarz + szyja + dekolt', price: 590 },
  { name: 'MedEstelle Redness Sendo Calm Premium twarz+szyja', price: 540 },
  { name: 'MedEstelle Redness Sendo Calm Premium - twarz', price: 490 },
  { name: 'Peeling MEDIDERMA® bankietowy odświeżający - twarz + szyja + dekolt', price: 400 },
  { name: 'Peeling MEDIDERMA® bankietowy odświeżający - twarz + szyja', price: 350 },
  { name: 'Peeling MEDIDERMA® bankietowy odświeżający - twarz/dekolt/plecy', price: 300 },
  { name: 'Peeling MEDIDERMA® bankietowy liftingujący - twarz + szyja + dekolt', price: 450 },
  { name: 'Peeling MEDIDERMA® bankietowy liftingujący - twarz + szyja', price: 400 },
  { name: 'Peeling MEDIDERMA® bankietowy liftingujący - twarz/plecy/dekolt', price: 350 },
  { name: 'Peeling MEDIDERMA® Bankietowy z wit.C - twarz + szyja + dekolt', price: 450 },
  { name: 'Peeling MEDIDERMA® Bankietowy z wit.C - twarz + szyja', price: 400 },
  { name: 'Peeling MEDIDERMA® Bankietowy z wit.C - twarz/plecy/dekolt', price: 350 },
  { name: 'Peeling MEDIDERMA® Podstawowy Ferulac Valencia - twarz + szyja + dekolt', price: 400 },
  { name: 'Peeling MEDIDERMA® Podstawowy Ferulac Valencia - twarz + szyja', price: 350 },
  { name: 'Peeling MEDIDERMA® Podstawowy Ferulac Valencia - twarz/plecy/dekolt', price: 300 },
  { name: 'Peeling MEDIDERMA® 3-Retises Ct Yellow - twarz + szyja + dekolt', price: 450 },
  { name: 'Peeling MEDIDERMA® 3-Retises Ct Yellow - twarz + szyja', price: 400 },
  { name: 'Peeling MEDIDERMA® 3-Retises Ct Yellow - twarz/dekolt/plecy', price: 350 },
  { name: 'Peeling MEDIDERMA® Podstawowy Ferulac System - twarz + szyja + dekolt', price: 400 },
  { name: 'Peeling MEDIDERMA® Podstawowy Ferulac System - twarz + szyja', price: 350 },
  { name: 'Peeling MEDIDERMA® Podstawowy Ferulac System - twarz/plecy/dekolt', price: 300 },
  { name: 'Peeling MEDIDERMA® Podstawowy DNA Recovery - twarz + szyja + dekolt', price: 400 },
  { name: 'Peeling MEDIDERMA® Podstawowy DNA Recovery - twarz + szyja', price: 350 },
  { name: 'Peeling MEDIDERMA® Podstawowy DNA Recovery - twarz/plecy/dekolt', price: 300 },
  { name: 'Peeling MEDIDERMA® Podstawowy Azelac - twarz + szyja + dekolt', price: 400 },
  { name: 'Peeling MEDIDERMA® Podstawowy Azelac - twarz + szyja', price: 350 },
  { name: 'Peeling MEDIDERMA® Podstawowy Azelac - twarz/plecy/dekolt', price: 300 },
  { name: 'HYDRAFACIAL® z peelingiem kwaoswym GLYSAL - twarz + szyja + dekolt', price: 995 },
  { name: 'HYDRAFACIAL® z peelingiem kwaoswym GLYSAL - twarz + szyja', price: 895 },
  { name: 'HYDRAFACIAL® z peelingiem kwaoswym GLYSAL - twarz', price: 795 },
  { name: 'Hydrafacial basic - twarz, szyja, dekolt', price: 500 },
  { name: 'Hydrafacial basic - twarz + szyja', price: 400 },
  { name: 'Hydrafacial basic - twarz', price: 350 },
  { name: 'Hydrafacial na plecy', price: 800 },
  { name: 'HYDRAFACIAL® oryg. oczyszczanie i rewitalizacja - twarz + szyja + dekolt', price: 895 },
  { name: 'HYDRAFACIAL® oryg. oczyszczanie i rewitalizacja - twarz + szyja', price: 795 },
  { name: 'HYDRAFACIAL® oryg. oczyszczanie i rewitalizacja - twarz', price: 695 },
  { name: 'Oczyszczanie manualne z peelingiem kwasowym', price: 350 },
  { name: 'Konsultacja z indywidualnie dobranym zabiegiem', price: 250 },
  { name: 'Letnie oczyszczanie twarzy', price: 220 },
  { name: 'Zabieg nawilżający na twarz', price: 260 },
  { name: 'Peeling kawitacyjny z peelingiem kwasowym', price: 320 },
  { name: 'Peeling kawitacyjny z doczyszczaniem manualnym', price: 270 },
  { name: 'Peeling medyczny twarz+szyja', price: 320 },
  { name: 'Supernowa Nebula Acto2 Orion Strong', price: 550 },
  { name: 'Tropokolagen GUNA - 3 ampułki', price: 1900 },
  { name: 'Tropokolagen GUNA - 2 ampułki', price: 1300 },
  { name: 'Tropokolagen GUNA - 1 ampułka', price: 700 },
  { name: 'Nici z kwasu polimlekowego (haczykowe) - 4 nitki', price: 4200 },
  { name: 'Nici z kwasu polimlekowego (haczykowe) - dodatkowa nitka', price: 1200 },
  { name: 'Nici stymulujące 20 szt', price: 2300 },
  { name: 'Konsultacja + USG leczenie powikłań', price: 550 },
  { name: 'Powtórzenie recepty', price: 100 },
  { name: 'Stymulator tkankowy Radiesse - 2 ampułki', price: 3200 },
  { name: 'Stymulator tkankowy Radiesse - 1 ampułka', price: 2200 },
  { name: 'PROFHILO STRUCTURA', price: 2000 },
  { name: 'PROFHILO BODY', price: 3000 },
  { name: 'Jalupro SUPERHYDRO - 2 amp', price: 2400 },
  { name: 'Stymulator tkankowy Jalupro SuperHydro®', price: 1600 },
  { name: 'Stymulator tkankowy Prophilo - molekuła młodości', price: 1400 },
  { name: 'Stymulator tkankowy Jalupro HMW', price: 1300 },
  { name: 'Stymulator tkankowy Jalupro HMW 2 amp', price: 2400 },
  { name: 'Stymulator tkankowy Jalupro Classic + Jalupro HMW', price: 1700 },
  { name: 'Plastyka blizny', price: 2500 },
  { name: 'Plastyka powiek dolnych', price: 7000 },
  { name: 'Lipotransfer - lifting pośladków', price: 10000 },
  { name: 'Lipotransfer - lifting twarzy', price: 9000 },
  { name: 'Lipotransfer - powiększanie piersi', price: 9500 },
  { name: 'Blefaroplastyka powiek górnych + dolnych + us. przepukliny tłuszczowej', price: 12000 },
  { name: 'Blefaroplastyka powiek górnych + lifting brwi', price: 9000 },
  { name: 'Blefaroplastyka powiek górnych + usunięcie przepuklin tłuszczowych', price: 6650 },
  { name: 'Blefaroplastyka powiek górnych', price: 6000 },
  { name: 'Laser tulowy twarz + szyja + dekolt', price: 2100 },
  { name: 'Laser tulowy dodatkowy obszar lub przebarwienie', price: 500 },
  { name: 'Laser tulowy na dłonie', price: 500 },
  { name: 'Laser tulowy na twarz', price: 1500 },
  { name: 'Laser tulowy twarz + szyja', price: 1700 },
  { name: 'Specjalistyczna konsultacja u Dr Marty', price: 290 },
  { name: 'Kwas hialuronowy autorska technika Dr Marty - 3 ampułki', price: 3600 },
  { name: 'Kwas hialuronowy autorska technika Dr Marty - 2 ampułki', price: 2600 },
  { name: 'Kwas hialuronowy autorska technika Dr Marty - 1 ampułka', price: 1400 },
  { name: 'GOURI ( płynny polikaprolakton) - 1 ml', price: 2000 },
  { name: 'Rewitalizujące nici PDO autorska technika -20 nici', price: 1800 },
  { name: 'Nowość! Toksynaa Relfydess - 3 okolice', price: 2500 },
  { name: 'Nowość! Toksynaa Relfydess - 2 okolice', price: 1700 },
  { name: 'Nowość! Toksynaa Relfydess - 1 okolica', price: 900 },
  { name: 'Hialuronidaza pod kontrolą USG', price: 1600 },
  { name: 'Kwas polimlekowy Lanluma pod kontrolą usg (twarz+szyja+dekolt)', price: 4200 },
  { name: 'Kwas polimlekowy lanluma - modelowanie pośladków', price: 5000 },
  { name: 'Kwas polimlekowy Lanluma pod kontrolą usg (twarz+szyja)', price: 3800 },
  { name: 'Kwas polimlekowy Lanluma twarz, szyja i dekolt', price: 3600 },
  { name: 'Kwas polimlekowy Lanluma twarz i szyja', price: 3200 },
  { name: 'Kwas polimlekowy Lanluma pod kontrolą usg (twarz)', price: 3100 },
  { name: 'Kwas polimlekowy Lanluma twarz', price: 2500 },
  { name: 'Wypełnianie zmarszczek- autorska technika Dr Marty', price: 1400 },
  { name: 'Wolumetria twarzy - autorską techniką dr Marty', price: 1600 },
  { name: 'Podcinanie blizn po trądziku autorską technika', price: 1200 },
  { name: 'Toksyna botulinowa - Leczenie bruksizmu', price: 1700 },
  { name: 'Toksyna botulinowa - Lip Flip / broda brukowana / uniesienie kącików ust', price: 750 },
  { name: 'Toksyna botulinowa - Zwężenie płatków nosa / podniesienie czubka nosa', price: 1000 },
  { name: 'Toksyna botulinowa - Leczenie nadpotliwości pachy / dłonie / stopy', price: 2000 },
  { name: 'Toksyna botulinowa - Lifting brwi', price: 2100 },
  { name: 'Toksyna botulinowa - Full Face', price: 4500 },
  { name: 'Toksyna botulinowa - 4 okolice', price: 2100 },
  { name: 'Toksyna botulinowa - 3 okolice', price: 1600 },
  { name: 'Toksyna botulinowa - 2 okolice', price: 1400 },
  { name: 'Toksyna botulinowa - 1 okolica', price: 750 },
  { name: 'Toksyna botulinowa - Leczenie migreny', price: 3500 },
  { name: 'Toksyna botulinowa - Redukcja uśmiechu dziąsłowego', price: 750 },
  { name: 'Plastyka powiek dolnych', price: 7000 },
  { name: 'Plastyka powiek górnych + usunięcie tłuszczu + lifting brwi', price: 9000 },
  { name: 'Plastyka powiek górnych', price: 5900 },
  { name: 'Plastyka powiek górnych + usunięcie tłuszczu z przegrody oczodołu', price: 6650 },
  { name: 'Lifting podbródka z liposukcją+nici+kwas hialuron.', price: 6000 },
  { name: 'Ellanse® M - autorska technika Dr Marty', price: 2500 },
  { name: 'Ellanse® S - autorska technika Dr Marty', price: 2000 },
  { name: 'Leczenie immunomodulujące - łysienie plackowate', price: 600 },
  { name: 'Łyżeczkowanie zmian skórnych', price: 400 },
  { name: 'Iniekcja sterydu', price: 350 },
  { name: 'Konsultacja z dermatoskopią', price: 350 },
  { name: 'Konsultacja dermatologiczna', price: 300 },
  { name: 'Peeling TCA Pain Control®', price: 600 },
  { name: 'Topilase® - bezbolesna hialuronidaza w kremie', price: 1200 },
  { name: 'Hialuronidaza', price: 1200 },
  { name: 'Modelowanie ust autorską techniką Dr Marty', price: 1300 },
];

const INVENTORY: Record<string, string[]> = {
  "TEOXANE": [
    "Redensity 1",
    "Redensity 2",
    "RHA 2",
    "RHA 3",
    "RHA 4",
    "RHA Kiss Volume",
    "Ultra Deep"
  ],
  "JALUPRO": [
    "Jalupro Super Hydro",
    "Jalupro HMW",
    "Jalupro Classic",
    "Jalupro Young Eye",
    "Jalupro Glow Peel"
  ],
  "DONGBANG MEDICAL": [
    "Elasty D",
    "Elasty F",
    "Elasty G",
    "Profhilo",
    "PILLA"
  ],
  "BIO|SCIENCE": [
    "BodyCountouring MLF 1"
  ],
  "APTOS": [
    "EVS",
    "LLL"
  ],
  "DEMULCENT": [
    "Collagen Solution type III",
    "Gouri",
    "Pluryal Silk",
    "Pluryal Mesoline",
    "Dermaheal SB",
    "Radiesse"
  ],
  "GUNA": [
    "MD-Muscle",
    "MD-Tissue",
    "NewU",
    "MCCM"
  ],
  "HYALUAL": [
    "Xela Rederm",
    "Electri"
  ],
  "AESTHETIC DERMAL": [
    "RRS Hyalift 75",
    "RRS XL Hair"
  ],
  "REVITACARE": [
    "Cytocare 520",
    "Cytocare 532",
    "Cytocare 640"
  ],
  "DIVES MED": [
    "Rich Hair",
    "Power Complex 06",
    "DrCyj",
    "Plinest Hair"
  ],
  "NEAUVIA": [
    "Neauvia Hydro Delux",
    "Neauvia Hydro Deluxe Man",
    "Ejal40",
    "Neobella"
  ],
  "SOFTFIL": [
    "Topilase",
    "Sunekos 200",
    "Sunekos 1200",
    "Sunekos Cell15"
  ],
  "INFINI": [
    "F5+",
    "V2",
    "V5",
    "V10",
    "V20",
    "Bio Age Peel"
  ],
  "SKYMEDIC": [
    "EXO OX",
    "NCTF 135 HA"
  ],
  "MESOESTETIC": [
    "C.PROF 210",
    "C.PROF 211",
    "C.PROF 213",
    "X.PROF 040"
  ],
  "NUCLEOFILL": [
    "Nucleofill Soft",
    "Nucleofill Strong",
    "Azzalure",
    "Reflydness",
    "Botox"
  ]
};

function slugify(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function inferCatalogCategory(name: string): string {
  const lower = name.toLowerCase();
  if (lower.includes("botox") || lower.includes("azzalure")) return "Toksyna botulinowa";
  if (lower.includes("peel")) return "Peeling";
  if (lower.includes("hair")) return "Trychologia";
  if (["evs", "lll"].includes(lower)) return "Nici";
  if (lower.includes("topilase")) return "Rozpuszczanie wypełniacza";
  if (lower.includes("radiesse") || lower.includes("gouri") || lower.includes("nucleofill") || lower.includes("plinest")) return "Biostymulator";
  if (lower.includes("sunekos") || lower.includes("jalupro") || lower.includes("cytocare") || lower.includes("nctf") || lower.includes("rrs") || lower.includes("xela") || lower.includes("c.prof") || lower.includes("x.prof") || lower.includes("mesoline") || lower.includes("dermaheal") || lower.includes("md-") || lower.includes("newu") || lower.includes("mccm") || lower.includes("electri") || lower.includes("exo ox")) return "Mezoterapia";
  return "Wypełniacz / preparat zabiegowy";
}

function inferUnit(name: string): UnitType {
  const lower = name.toLowerCase();
  if (lower.includes("botox") || lower.includes("azzalure")) return UnitType.BOTOX_UNIT;
  if (lower.includes("nctf") || lower.includes("cytocare") || lower.includes("rrs") || lower.includes("sunekos") || lower.includes("jalupro") || lower.includes("nucleofill") || lower.includes("xela") || lower.includes("drcyj") || lower.includes("plinest") || lower.includes("dermaheal") || lower.includes("mesoline")) return UnitType.AMPULE;
  return UnitType.UNIT;
}

function priceForIndex(index: number) {
  const purchase = 22000 + index * 850;
  const sale = Math.round(purchase * 1.38);
  return { purchase, sale };
}
const SERVICE_CATEGORIES = [
  "Medycyna estetyczna",
  "Dermatologia",
  "Kosmetologia estetyczna",
  "Ginekologia",
  "Chirurgia plastyczna",
  "Chirurgia naczyniowa",
  "Badania USG",
  "Centrum leczenia ran",
  "Leczenie otyłości",
] as const;

type ServiceCategory = (typeof SERVICE_CATEGORIES)[number];

function inferServiceCategory(name: string): ServiceCategory {
  const lower = name.toLowerCase();

  if (lower.includes("otyło") || lower.includes("obesitolog")) return "Leczenie otyłości";

  if (
    lower.includes("ginekolog") ||
    lower.includes("ciąży") ||
    lower.includes("cytologia") ||
    lower.includes("wkładki") ||
    lower.includes("pochw") ||
    lower.includes("sromu") ||
    lower.includes("labioplast") ||
    lower.includes("punktu g") ||
    lower.includes("łechtacz")
  ) return "Ginekologia";

  if (
    lower.includes("flebolog") ||
    lower.includes("żylak") ||
    lower.includes("skleroter") ||
    lower.includes("miniflebekt") ||
    lower.includes("doppler") ||
    lower.includes("aorty") ||
    lower.includes("tętnic") ||
    lower.includes("kończyn")
  ) return "Chirurgia naczyniowa";

  if (
    lower.includes("usg") &&
    !lower.includes("ginekolog") &&
    !lower.includes("obesitolog") &&
    !lower.includes("otyło")
  ) return "Badania USG";

  if (
    lower.includes("rana") ||
    lower.includes("ropnia") ||
    lower.includes("leczenie ran")
  ) return "Centrum leczenia ran";

  if (
    lower.includes("lipotransfer") ||
    lower.includes("blefaroplast") ||
    lower.startsWith("plastyka ") ||
    lower.includes("lifting podbródka")
  ) return "Chirurgia plastyczna";

  if (
    lower.includes("dermatolog") ||
    lower.includes("dermatoskop") ||
    lower.includes("histopatolog") ||
    lower.includes("zmiany skór") ||
    lower.includes("nowotworu skóry") ||
    lower.includes("kępek żółtych") ||
    lower.includes("łyżeczkowanie zmian") ||
    lower.includes("sterydu")
  ) return "Dermatologia";

  if (
    lower.includes("masaż") ||
    lower.includes("icoone") ||
    lower.includes("hydrafacial") ||
    lower.includes("oczyszczanie") ||
    lower.includes("henna") ||
    lower.includes("brwi") ||
    lower.includes("rzęs") ||
    lower.includes("makijaż permanentny") ||
    lower.includes("peeling") ||
    lower.includes("kawitacyjny") ||
    lower.includes("rituał") ||
    lower.includes("rytuał") ||
    lower.includes("wapozon") ||
    lower.includes("darsonwal") ||
    lower.includes("madero") ||
    lower.includes("kobido") ||
    lower.includes("presoterapia") ||
    lower.includes("kosmetologiczna") ||
    lower.includes("micropeel") ||
    lower.includes("acto2")
  ) return "Kosmetologia estetyczna";

  return "Medycyna estetyczna";
}

function inferServiceDuration(name: string): number {
  const lower = name.toLowerCase();
  if (lower.includes("recepcja") || lower.includes("kontrola") || lower.includes("powtórzenie recepty")) return 10;
  if (lower.includes("dodatek") || lower.includes("henna") || lower.includes("regulacja") || lower.includes("tapping")) return 15;
  if (lower.includes("usg") || lower.includes("konsultacja") || lower.includes("cytologia")) return 30;
  if (lower.includes("masaż") || lower.includes("hydrafacial") || lower.includes("oczyszczanie") || lower.includes("peeling") || lower.includes("icoone")) return 60;
  if (lower.includes("pakiet 10 zabiegów") || lower.includes("pakiet 3 zabiegi")) return 75;
  if (lower.includes("lipotransfer") || lower.includes("blefaroplastyka") || lower.includes("plastyka") || lower.includes("laserowe usuwanie żylaków") || lower.includes("laser tulowy") || lower.includes("nici")) return 120;
  return 45;
}

function inferServiceDescription(name: string, price: number): string {
  return `Usługa seedowana roboczo z cennika kliniki. Cena sugerowana: ${price} PLN.`;
}


async function main() {
  const login = "admin";
  const existing = await prisma.user.findUnique({ where: { login } });
  if (!existing) {
    const passwordHash = await bcrypt.hash("admin", 10);
    await prisma.user.create({
      data: {
        login,
        name: "Administrator",
        role: Role.ADMIN,
        passwordHash,
      },
    });
    console.log("✅ Seeded default admin (admin/admin)");
  } else {
    console.log("ℹ️ Default admin already exists");
  }

  const mainWh = await prisma.warehouse.upsert({
    where: { id: "main-warehouse" },
    update: { name: "Magazyn główny - Grodzisk Mazowiecki", parentId: null },
    create: { id: "main-warehouse", name: "Magazyn główny - Grodzisk Mazowiecki" },
  });

  const treatmentWh = await prisma.warehouse.upsert({
    where: { id: "treatment-warehouse" },
    update: { name: "Gabinet zabiegowy - Grodzisk Mazowiecki", parentId: mainWh.id },
    create: { id: "treatment-warehouse", name: "Gabinet zabiegowy - Grodzisk Mazowiecki", parentId: mainWh.id },
  });

  let globalIndex = 0;

  for (const [manufacturer, products] of Object.entries(INVENTORY)) {
    for (const name of products) {
      globalIndex += 1;
      const productId = `seed-${slugify(manufacturer)}-${slugify(name)}`;
      const sku = `DC-${String(globalIndex).padStart(3, "0")}`;
      const { purchase, sale } = priceForIndex(globalIndex);
      const quantityMain = 2 + (globalIndex % 6);
      const quantityTreatment = globalIndex % 3;
      const expiryMonth = (globalIndex % 12) + 1;
      const expiryDay = ((globalIndex * 2) % 25) + 1;
      const expiryDate = new Date(Date.UTC(2027 + (globalIndex % 2), expiryMonth - 1, expiryDay));
      const batch = `LOT-${String(globalIndex).padStart(4, "0")}`;
      const status = quantityMain + quantityTreatment <= 2 ? "Niski stan" : expiryDate.getTime() < Date.UTC(2027, 0, 1) ? "Krótki termin" : "Dostępny";

      const product = await prisma.product.upsert({
        where: { id: productId },
        update: {
          category: ProductCategory.PREPARATION,
          name,
          sku,
          unit: inferUnit(name),
          manufacturer,
          catalogCategory: inferCatalogCategory(name),
          purchasePrice: purchase,
          salePrice: sale,
          isActive: true,
        },
        create: {
          id: productId,
          category: ProductCategory.PREPARATION,
          name,
          sku,
          unit: inferUnit(name),
          manufacturer,
          catalogCategory: inferCatalogCategory(name),
          purchasePrice: purchase,
          salePrice: sale,
          isActive: true,
        },
      });

      await prisma.stock.upsert({
        where: { productId_warehouseId: { productId: product.id, warehouseId: mainWh.id } },
        update: { quantity: quantityMain },
        create: { productId: product.id, warehouseId: mainWh.id, quantity: quantityMain },
      });

      await prisma.stock.upsert({
        where: { productId_warehouseId: { productId: product.id, warehouseId: treatmentWh.id } },
        update: { quantity: quantityTreatment },
        create: { productId: product.id, warehouseId: treatmentWh.id, quantity: quantityTreatment },
      });

      await prisma.productLot.upsert({
        where: { id: `lot-main-${slugify(manufacturer)}-${slugify(name)}` },
        update: {
          warehouseId: mainWh.id,
          batchNumber: batch,
          expiryDate,
          quantity: quantityMain,
          purchasePrice: purchase,
          salePrice: sale,
          status,
          location: "Grodzisk Mazowiecki",
          note: `Robocza seria dla produktu ${name}`,
        },
        create: {
          id: `lot-main-${slugify(manufacturer)}-${slugify(name)}`,
          productId: product.id,
          warehouseId: mainWh.id,
          batchNumber: batch,
          expiryDate,
          quantity: quantityMain,
          purchasePrice: purchase,
          salePrice: sale,
          status,
          location: "Grodzisk Mazowiecki",
          note: `Robocza seria dla produktu ${name}`,
        },
      });

      if (quantityTreatment > 0) {
        await prisma.productLot.upsert({
          where: { id: `lot-treatment-${slugify(manufacturer)}-${slugify(name)}` },
          update: {
            warehouseId: treatmentWh.id,
            batchNumber: `${batch}-A`,
            expiryDate,
            quantity: quantityTreatment,
            purchasePrice: purchase,
            salePrice: sale,
            status: quantityTreatment <= 1 ? "Niski stan" : "Dostępny",
            location: "Grodzisk Mazowiecki",
            note: `Robocza seria gabinetowa dla produktu ${name}`,
          },
          create: {
            id: `lot-treatment-${slugify(manufacturer)}-${slugify(name)}`,
            productId: product.id,
            warehouseId: treatmentWh.id,
            batchNumber: `${batch}-A`,
            expiryDate,
            quantity: quantityTreatment,
            purchasePrice: purchase,
            salePrice: sale,
            status: quantityTreatment <= 1 ? "Niski stan" : "Dostępny",
            location: "Grodzisk Mazowiecki",
            note: `Robocza seria gabinetowa dla produktu ${name}`,
          },
        });
      }
    }
  }

  let seededServices = 0;

  for (let index = 0; index < SERVICES.length; index += 1) {
    const service = SERVICES[index];
    await prisma.service.upsert({
      where: { id: `service-seed-${String(index + 1).padStart(3, "0")}` },
      update: {
        name: service.name,
        category: inferServiceCategory(service.name),
        description: inferServiceDescription(service.name, service.price),
        durationMin: inferServiceDuration(service.name),
        priceFrom: service.price * 100,
        priceSuggested: service.price * 100,
      },
      create: {
        id: `service-seed-${String(index + 1).padStart(3, "0")}`,
        name: service.name,
        category: inferServiceCategory(service.name),
        description: inferServiceDescription(service.name, service.price),
        durationMin: inferServiceDuration(service.name),
        priceFrom: service.price * 100,
        priceSuggested: service.price * 100,
      },
    });
    seededServices += 1;
  }

  console.log(`✅ Seed completed: ${globalIndex} produktów, ${seededServices} usług`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
