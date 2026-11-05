#!/usr/bin/env python3
"""Generate ICB static pages from a shared header/footer template."""
import os

BASE = os.path.dirname(os.path.abspath(__file__))

NAV = [
    ("index.html", "nav_home", "Accueil"),
    ("personal.html", "nav_personal", "Particuliers"),
    ("business.html", "nav_business", "Entreprises"),
    ("loans.html", "nav_loans", "Prêts"),
    ("digital.html", "nav_digital", "Banque digitale"),
    ("rates.html", "nav_rates", "Taux et frais"),
    ("branches.html", "nav_branches", "Agences et GAB"),
    ("contact.html", "nav_contact", "Contact"),
    ("faq.html", "nav_faq", "FAQ"),
]

def header(active, title):
    links = "".join(
        f'\n      <a href="{href}"{(" class=\"active\"" if href == active else "")} data-i18n="{key}">{label}</a>'
        for href, key, label in NAV)
    return f"""<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Industrial Commercial Bank — {title}</title>
<link rel="stylesheet" href="css/style.css">
</head>
<body>
<header class="site-header">
  <div class="header-inner">
    <a class="brand" href="index.html"><img src="images/logo.svg" alt="Logo Industrial Commercial Bank"><span>Industrial Commercial Bank<small data-i18n="brand_tag">Une banque bâtie sur des fondations solides</small></span></a>
    <button class="nav-toggle" aria-label="Menu">☰</button>
    <nav class="main-nav">{links}
    </nav>
    <div class="lang-switch"><button data-lang="fr" class="active">FR</button><button data-lang="en">EN</button></div>
  </div>
</header>
"""

FOOTER = """
<footer class="site-footer">
  <div class="footer-inner">
    <div><h4>Industrial Commercial Bank</h4><p data-i18n="footer_about">Industrial Commercial Bank propose des services bancaires simples et fiables pour les particuliers et les entreprises.</p></div>
    <div><h4 data-i18n="footer_links_title">Liens rapides</h4><ul>
      <li><a href="personal.html" data-i18n="nav_personal">Particuliers</a></li>
      <li><a href="business.html" data-i18n="nav_business">Entreprises</a></li>
      <li><a href="loans.html" data-i18n="nav_loans">Prêts</a></li>
      <li><a href="rates.html" data-i18n="nav_rates">Taux et frais</a></li>
      <li><a href="branches.html" data-i18n="nav_branches">Agences et GAB</a></li>
    </ul></div>
    <div><h4 data-i18n="footer_contact_title">Contact</h4><ul>
      <li>Tél : <span class="placeholder">[Phone to be added]</span></li>
      <li>E-mail : <span class="placeholder">[Email to be added]</span></li>
      <li>Adresse : <span class="placeholder">[Address to be added]</span></li>
    </ul></div>
    <div><h4 data-i18n="footer_legal_title">Mentions légales</h4><ul>
      <li><a href="legal.html">Confidentialité et conditions</a></li>
      <li><a href="faq.html" data-i18n="nav_faq">FAQ</a></li>
      <li><a href="contact.html" data-i18n="nav_contact">Contact</a></li>
    </ul></div>
  </div>
  <div class="footer-bottom"><span data-i18n="footer_rights">© Industrial Commercial Bank. Tous droits réservés. Site vitrine — Phase 1.</span></div>
</footer>
<!-- WhatsApp button: number to be added — links to contact page until then -->
<a class="wa-btn" href="contact.html" title="WhatsApp number to be added" aria-label="WhatsApp (number to be added)">💬</a>
<script src="js/main.js"></script>
<script src="js/translator.js"></script>
{EXTRA_SCRIPTS}</body>
</html>
"""

def hero(title_key, title, sub_key, sub, cta=True):
    cta_html = '<div class="cta-row"><a class="btn btn-light" href="open-account.html" data-i18n="cta_open">Ouvrir un compte</a></div>' if cta else ''
    return f"""
<section class="hero">
  <div class="container">
    <h1 data-i18n="{title_key}">{title}</h1>
    <p data-i18n="{sub_key}">{sub}</p>
    {cta_html}
  </div>
</section>
"""

PAGES = {}

PAGES["loans.html"] = (header("loans.html", "Prêts") + hero("loan_hero_title", "Prêts", "loan_hero_sub", "Financez vos projets : personnel, immobilier, véhicule ou professionnel.") + """
<section class="section">
  <div class="container">
    <h2 data-i18n="loan_types_title">Nos types de prêts</h2>
    <div class="grid">
      <div class="card"><h3>Prêt personnel</h3><p>Pour vos projets de vie : mariage, études, équipement de la maison.</p></div>
      <div class="card"><h3>Prêt immobilier</h3><p>Achetez ou construisez votre logement, avec un plan de remboursement adapté.</p></div>
      <div class="card"><h3>Prêt véhicule</h3><p>Financez l'achat d'un véhicule neuf ou d'occasion.</p></div>
      <div class="card"><h3>Prêt professionnel</h3><p>Équipement, stock ou développement de votre activité.</p></div>
    </div>
  </div>
</section>
<section class="section alt">
  <div class="container">
    <h2 data-i18n="loan_calc_title">Simulateur de prêt</h2>
    <p class="lead" data-i18n="loan_calc_note">Simulation indicative uniquement. Le taux final dépend de votre dossier et est confirmé par la banque.</p>
    <div class="card">
      <div class="field"><label data-i18n="loan_amount">Montant du prêt</label><input type="number" id="loan-amount" value="1000000" min="0"></div>
      <div class="field"><label data-i18n="loan_rate">Taux annuel (%)</label><input type="number" id="loan-rate" value="10" min="0" step="0.1"></div>
      <div class="field"><label data-i18n="loan_term">Durée (mois)</label><input type="number" id="loan-term" value="24" min="1"></div>
      <div class="calc-result" id="loan-result"></div>
    </div>
    <p style="margin-top:24px"><a class="btn" href="open-account.html" data-i18n="cta_open">Ouvrir un compte</a></p>
  </div>
</section>
""" + FOOTER.format(EXTRA_SCRIPTS='<script src="js/calculators.js"></script>\n'))

PAGES["digital.html"] = (header("digital.html", "Banque digitale") + hero("dig_hero_title", "Banque digitale", "dig_hero_sub", "Votre banque dans votre poche : application mobile, USSD et Mobile Money.") + """
<section class="section">
  <div class="container">
    <div class="grid">
      <div class="card"><h3 data-i18n="dig_app_title">Application mobile</h3><p>Consultez votre solde, faites des virements et payez vos factures depuis votre téléphone.</p><p><span class="placeholder">[App store links to be added]</span></p></div>
      <div class="card"><h3 data-i18n="dig_ussd_title">Banque USSD</h3><p>Accédez à vos services bancaires depuis n'importe quel téléphone mobile, sans internet.</p><p>Code USSD : <span class="placeholder">[USSD code to be added]</span></p></div>
      <div class="card"><h3 data-i18n="dig_mm_title">Mobile Money</h3><p>Liez votre compte à votre portefeuille Mobile Money pour transférer de l'argent instantanément.</p></div>
      <div class="card"><h3 data-i18n="dig_cards_title">Cartes et paiements</h3><p>Cartes de débit et prépayées pour payer en boutique et en ligne, et retirer aux guichets automatiques.</p></div>
    </div>
  </div>
</section>
""" + FOOTER.format(EXTRA_SCRIPTS=""))

PAGES["rates.html"] = (header("rates.html", "Taux et frais") + hero("rates_hero_title", "Taux et frais", "rates_hero_sub", "Nos taux et frais, présentés simplement. Les valeurs exactes sont confirmées par la banque.", cta=False) + """
<section class="section">
  <div class="container">
    <div class="notice"><strong data-i18n="rates_note">Les taux et frais affichés sont des exemples de structure. Les valeurs définitives seront communiquées par la banque.</strong></div>
    <h2 data-i18n="rates_sav_title">Taux d'épargne</h2>
    <table>
      <tr><th>Produit</th><th>Taux annuel</th><th>Conditions</th></tr>
      <tr><td data-label="Produit">Compte d'épargne</td><td data-label="Taux annuel"><span class="placeholder">[Rate to be confirmed]</span></td><td data-label="Conditions">Versements libres</td></tr>
      <tr><td data-label="Produit">Dépôt à terme 6 mois</td><td data-label="Taux annuel"><span class="placeholder">[Rate to be confirmed]</span></td><td data-label="Conditions">Montant bloqué 6 mois</td></tr>
      <tr><td data-label="Produit">Dépôt à terme 12 mois</td><td data-label="Taux annuel"><span class="placeholder">[Rate to be confirmed]</span></td><td data-label="Conditions">Montant bloqué 12 mois</td></tr>
    </table>
    <h2 data-i18n="rates_loan_title">Taux de prêt</h2>
    <table>
      <tr><th>Produit</th><th>Taux annuel</th><th>Durée</th></tr>
      <tr><td data-label="Produit">Prêt personnel</td><td data-label="Taux annuel"><span class="placeholder">[Rate to be confirmed]</span></td><td data-label="Durée">Jusqu'à 60 mois</td></tr>
      <tr><td data-label="Produit">Prêt immobilier</td><td data-label="Taux annuel"><span class="placeholder">[Rate to be confirmed]</span></td><td data-label="Durée">Jusqu'à 240 mois</td></tr>
      <tr><td data-label="Produit">Prêt professionnel</td><td data-label="Taux annuel"><span class="placeholder">[Rate to be confirmed]</span></td><td data-label="Durée">Selon le projet</td></tr>
    </table>
    <h2 data-i18n="rates_fees_title">Frais de service</h2>
    <table>
      <tr><th>Service</th><th>Frais</th></tr>
      <tr><td data-label="Service">Ouverture de compte</td><td data-label="Frais"><span class="placeholder">[Fee to be confirmed]</span></td></tr>
      <tr><td data-label="Service">Carte de débit (annuel)</td><td data-label="Frais"><span class="placeholder">[Fee to be confirmed]</span></td></tr>
      <tr><td data-label="Service">Virement national</td><td data-label="Frais"><span class="placeholder">[Fee to be confirmed]</span></td></tr>
      <tr><td data-label="Service">Retrait GAB (réseau de la banque)</td><td data-label="Frais"><span class="placeholder">[Fee to be confirmed]</span></td></tr>
    </table>
  </div>
</section>
""" + FOOTER.format(EXTRA_SCRIPTS=""))

PAGES["branches.html"] = (header("branches.html", "Agences et GAB") + hero("br_hero_title", "Agences et GAB", "br_hero_sub", "Trouvez une agence ou un guichet automatique près de chez vous.", cta=False) + """
<section class="section">
  <div class="container">
    <h2>Carte</h2>
    <div class="map-wrap">
      <iframe title="Carte des agences — Douala" src="https://www.openstreetmap.org/export/embed.html?bbox=9.6000%2C3.9500%2C9.8500%2C4.1500&amp;layer=mapnik&amp;marker=4.0500%2C9.7000" loading="lazy"></iframe>
    </div>
    <p><small>Carte centrée sur Douala à titre indicatif — les emplacements exacts des agences seront ajoutés dès qu'ils seront fournis.</small></p>
    <h2 style="margin-top:40px" data-i18n="br_list_title">Nos agences</h2>
    <div class="grid">
      <div class="card"><h3>Agence — Siège</h3><p><span class="placeholder">[Branch address to be added]</span></p><p>Tél : <span class="placeholder">[Phone to be added]</span></p></div>
      <div class="card"><h3>Agence 2</h3><p><span class="placeholder">[Branch address to be added]</span></p><p>Tél : <span class="placeholder">[Phone to be added]</span></p></div>
      <div class="card"><h3>Agence 3</h3><p><span class="placeholder">[Branch address to be added]</span></p><p>Tél : <span class="placeholder">[Phone to be added]</span></p></div>
    </div>
    <h2 style="margin-top:40px" data-i18n="br_atm_title">Guichets automatiques (GAB)</h2>
    <div class="grid">
      <div class="card"><h3>GAB — Emplacement 1</h3><p><span class="placeholder">[ATM location to be added]</span></p></div>
      <div class="card"><h3>GAB — Emplacement 2</h3><p><span class="placeholder">[ATM location to be added]</span></p></div>
    </div>
  </div>
</section>
""" + FOOTER.format(EXTRA_SCRIPTS=""))

PAGES["contact.html"] = (header("contact.html", "Contact") + hero("con_hero_title", "Contactez-nous", "con_hero_sub", "Une question ? Écrivez-nous, notre équipe vous répondra.", cta=False) + """
<section class="section">
  <div class="container">
    <div class="grid">
      <div class="card"><h3>Téléphone</h3><p><span class="placeholder">[Phone to be added]</span></p></div>
      <div class="card"><h3>E-mail</h3><p><span class="placeholder">[Email to be added]</span></p></div>
      <div class="card"><h3>Adresse</h3><p><span class="placeholder">[Address to be added]</span></p></div>
    </div>
    <h2 style="margin-top:40px" data-i18n="con_form_title">Formulaire de contact</h2>
    <form data-local-confirm="contact-result">
      <div class="field"><label data-i18n="con_name">Nom complet</label><input type="text" name="name" required></div>
      <div class="field"><label data-i18n="con_email">Adresse e-mail</label><input type="email" name="email" required></div>
      <div class="field"><label data-i18n="con_subject">Sujet</label><input type="text" name="subject" required></div>
      <div class="field"><label data-i18n="con_message">Votre message</label><textarea name="message" rows="5" required></textarea></div>
      <button class="btn" type="submit" data-i18n="con_send">Envoyer le message</button>
    </form>
    <div class="form-result" id="contact-result"><strong data-i18n="con_success">Merci ! Votre message a bien été pris en compte (formulaire de démonstration — l'envoi réel arrive avec la Phase 2).</strong></div>
  </div>
</section>
""" + FOOTER.format(EXTRA_SCRIPTS=""))

FAQ_ITEMS = [
    ("faq_q1", "Comment ouvrir un compte ?", "faq_a1", "Remplissez le formulaire d'ouverture de compte en ligne. Notre équipe examine votre dossier et votre pièce d'identité, puis vous confirme l'ouverture."),
    ("faq_q2", "Quels documents faut-il pour ouvrir un compte ?", "faq_a2", "Une pièce d'identité en cours de validité et un justificatif de domicile. Pour un compte professionnel, les documents d'enregistrement de l'entreprise sont également demandés."),
    ("faq_q3", "Comment obtenir un prêt ?", "faq_a3", "Utilisez le simulateur de prêt pour estimer vos mensualités, puis faites votre demande en agence ou via le formulaire de contact. La décision finale dépend de l'étude de votre dossier."),
    ("faq_q4", "La banque propose-t-elle une application mobile ?", "faq_a4", "Oui : application mobile, banque USSD et Mobile Money sont disponibles pour gérer votre compte au quotidien."),
    ("faq_q5", "Comment contacter la banque ?", "faq_a5", "Par le formulaire de contact de ce site ou en agence. Les numéros de téléphone et adresses e-mail seront publiés dès qu'ils seront confirmés par la banque."),
    ("faq_q6", "Mes informations personnelles sont-elles protégées ?", "faq_a6", "Oui. Ce site ne collecte aucune donnée bancaire. Les pièces d'identité ne seront traitées que par le système sécurisé de la Phase 2, et jamais vendues ni partagées."),
]
faq_html = "".join(
    f'\n    <div class="faq-item"><button class="faq-q" aria-expanded="false"><span data-i18n="{q}">{qt}</span><span>+</span></button><div class="faq-a"><p data-i18n="{a}">{at}</p></div></div>'
    for q, qt, a, at in FAQ_ITEMS)

PAGES["faq.html"] = (header("faq.html", "FAQ") + hero("faq_hero_title", "Questions fréquentes", "faq_hero_sub", "Les réponses aux questions que l'on nous pose le plus souvent.", cta=False) + """
<section class="section">
  <div class="container">
""" + faq_html + """
  </div>
</section>
""" + FOOTER.format(EXTRA_SCRIPTS=""))

PAGES["legal.html"] = (header("legal.html", "Mentions légales") + hero("leg_hero_title", "Mentions légales", "leg_hero_sub", "Confidentialité et conditions d'utilisation du site.", cta=False) + """
<section class="section">
  <div class="container">
    <h2 data-i18n="leg_privacy_title">Politique de confidentialité</h2>
    <p>Ce site est un site vitrine (Phase 1). Il ne collecte aucune donnée bancaire et n'effectue aucune transaction. Les formulaires de cette version sont des démonstrations : aucune donnée saisie n'est envoyée à un serveur ni conservée.</p>
    <p>Lorsque le système de demande de compte (Phase 2) sera mis en service, les pièces d'identité et informations personnelles seront transmises de façon sécurisée, utilisées uniquement pour l'examen de la demande, et ne seront ni vendues ni partagées avec des tiers sans consentement.</p>
    <h2 style="margin-top:40px" data-i18n="leg_terms_title">Conditions d'utilisation</h2>
    <p>Les contenus de ce site sont fournis à titre d'information. Les taux, frais et conditions des produits sont indicatifs et confirmés par la banque au moment de la souscription. Aucune opération bancaire réelle ne peut être effectuée depuis ce site.</p>
    <p>Éditeur : <span class="placeholder">[Legal entity details to be added]</span></p>
  </div>
</section>
""" + FOOTER.format(EXTRA_SCRIPTS=""))

PAGES["open-account.html"] = (header("open-account.html", "Ouvrir un compte") + hero("open_hero_title", "Ouvrir un compte", "open_hero_sub", "Faites votre demande en ligne. Notre équipe examine votre dossier et vous accompagne.", cta=False) + """
<section class="section">
  <div class="container">
    <form data-local-confirm="open-result">
      <fieldset>
        <legend data-i18n="open_personal_title">Informations personnelles</legend>
        <div class="field"><label>Prénom</label><input type="text" name="first_name" required></div>
        <div class="field"><label>Nom de famille</label><input type="text" name="last_name" required></div>
        <div class="field"><label>Date de naissance</label><input type="date" name="dob" required></div>
        <div class="field"><label>Nationalité</label><input type="text" name="nationality" required></div>
      </fieldset>
      <fieldset>
        <legend data-i18n="open_contact_title">Coordonnées</legend>
        <div class="field"><label>Téléphone</label><input type="tel" name="phone" required></div>
        <div class="field"><label>Adresse e-mail</label><input type="email" name="email" required></div>
        <div class="field"><label>Adresse de résidence</label><input type="text" name="address" required></div>
      </fieldset>
      <fieldset>
        <legend data-i18n="open_id_title">Pièce d'identité</legend>
        <div class="field"><label>Type de pièce</label><select name="id_type" required><option value="">— Choisir —</option><option>Carte nationale d'identité</option><option>Passeport</option><option>Permis de conduire</option></select></div>
        <div class="field"><label>Numéro de la pièce</label><input type="text" name="id_number" required></div>
        <div class="field"><label>Photo de la pièce d'identité</label><input type="file" id="id-photo" name="id_photo" accept="image/*,.pdf"><small id="id-photo-name"></small><br><small>Les pièces d'identité sont des données sensibles. Dans la version finale, elles seront transmises de façon chiffrée et traitées uniquement par la banque.</small></div>
      </fieldset>
      <fieldset>
        <legend data-i18n="open_account_title">Type de compte</legend>
        <div class="field"><label>Type de compte souhaité</label><select name="account_type" required><option value="">— Choisir —</option><option>Compte courant — Particulier</option><option>Compte d'épargne — Particulier</option><option>Compte professionnel — Entreprise</option></select></div>
      </fieldset>
      <button class="btn" type="submit" data-i18n="open_submit">Envoyer ma demande</button>
    </form>
    <div class="form-result" id="open-result">
      <h3 data-i18n="open_success_title">Demande reçue — en cours d'examen</h3>
      <p data-i18n="open_success_text">Merci ! Votre demande d'ouverture de compte a bien été enregistrée et est en cours d'examen. Notre équipe vous contactera.</p>
      <p>Référence de démonstration : <strong data-demo-ref></strong></p>
      <p><small data-i18n="open_demo_note">Version de démonstration : aucune donnée n'a été envoyée. Le système sécurisé d'envoi et le tableau de bord d'administration arrivent avec la Phase 2.</small></p>
    </div>
  </div>
</section>
""" + FOOTER.format(EXTRA_SCRIPTS=""))

for name, html in PAGES.items():
    with open(os.path.join(BASE, name), "w", encoding="utf-8") as f:
        f.write(html)
    print("wrote", name, len(html), "bytes")
