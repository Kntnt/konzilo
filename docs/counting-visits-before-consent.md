# Counting visits before consent: a guide for site owners

A site on Konzilo can count every visit with Matomo from the first page, before the visitor makes a choice, by declaring the departure `statisticsWithoutStorageBeforeConsent` ([ADR 0049](adr/0049-manage-consent-with-konzilos-own-client-from-one-service-registry.md), [ADR 0050](adr/0050-load-a-tag-manager-by-its-container-after-consent-to-statistics.md)). This guide is for the owner of such a site: what the rules ask, what Konzilo counts and why, how a visitor objects, what the reports then mean, what to set in Matomo, and what the site's policies can say. It states facts and suggestions, not legal advice; the owner is the controller, and the assessment is the owner's to make and keep.

Every source was read on 2026-11-10.

## Two sets of rules

Two rules apply at once, and a site must meet both.

**The rule on the visitor's device.** Article 5(3) of the ePrivacy Directive allows "the storing of information, or the gaining of access to information already stored, in the terminal equipment of a subscriber or user" only with consent, unless it is for the transmission of a communication or "strictly necessary" for a service the user explicitly asked for ([Directive 2002/58/EC, consolidated 19 December 2009](https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:02002L0058-20091219)). Each member state writes it into its own law; Sweden's is chapter 9, section 28 of the Electronic Communications Act, *lag (2022:482) om elektronisk kommunikation* ([Riksdagen](https://www.riksdagen.se/sv/dokument-och-lagar/dokument/svensk-forfattningssamling/lag-2022482-om-elektronisk-kommunikation_sfs-2022-482/)). The rule covers every kind of storage and reading, not cookies alone: local storage, a script that reads the screen's size, and information that is no personal data at all (EDPB, [Guidelines 2/2023 on the technical scope of Art. 5(3) of the ePrivacy Directive, version 2.0](https://www.edpb.europa.eu/documents/guideline/guidelines-22023-on-technical-scope-of-art-53-of-eprivacy-directive_en), paragraphs 7 to 12).

**The rule on personal data.** The GDPR needs a legal basis for every processing of personal data, and the data a measurement request carries, an IP address among it, can identify a person, alone or with other data ([Regulation (EU) 2016/679](https://eur-lex.europa.eu/eli/reg/2016/679/oj), Article 6(1) and recital 30). Counting without consent rests on the site's legitimate interest, Article 6(1)(f). A legitimate interest does not make storage or reading on the device lawful: the GDPR is without prejudice to the ePrivacy rule (EDPB, [Guidelines 1/2024 on processing of personal data based on Article 6(1)(f) GDPR](https://www.edpb.europa.eu/public-consultations/guidelines-12024-on-processing-of-personal-data-based-on-article-61f-gdpr_en), paragraph 11).

So the site counts before consent only what it can count without touching the device, and on a basis the GDPR accepts for it.

## What is counted without consent, and why

### The server-log principle

Before consent, Matomo counts only what a web server's log would hold of each request: nothing is stored in the browser, and nothing is read from the device beyond what the browser sends with every request anyway.

| What | Before consent | After consent to statistics |
|---|---|---|
| A page view: its address, its title, the page the visitor came from, campaign parameters | Yes | Yes |
| Browser, operating system and type of device, as families, from the browser's own identification | Yes | Yes |
| Language, from what the browser asks for | Yes | Yes |
| Country and region, from the shortened IP address | Yes | Yes |
| Time of day, in the site's time zone | Yes | In the visitor's own |
| Downloads, and clicks on links to other sites | Yes | Yes |
| The page views of one visit tied together, by Matomo on its server, within that visit | Yes | Yes |
| Recognising the visitor between visits, by a cookie | No | Yes |
| Screen size, versions of the operating system, the device's model and the browser's features, the detailed client hints | No | Yes |
| The visitor's own time zone | No | Yes |
| How fast the page loaded, measured in the browser | No | From the next page view |

Konzilo makes it so with Matomo's documented calls ([JavaScript tracking client](https://developer.matomo.org/api-reference/tracking-javascript), [consent guide](https://developer.matomo.org/guides/tracking-consent)): `requireCookieConsent`, so that no cookie is used; `disableBrowserFeatureDetection`, so that no property of the browser or the screen is read; `disablePerformanceTracking`, so that no load time is read; and `setCustomRequestProcessing`, which puts each request's time of day in the site's time zone. Matomo's own tracker reads the hour, minute and second from the device's clock in the device's time zone, which would read that zone; left out, Matomo would record UTC. The site's time zone is the setting *Time zone* of the tag manager, by its IANA name, such as `Europe/Paris`, and should be the one the site has in Matomo; without it the time is UTC, and every build warns. Once the visitor allows statistics, the cookie, the browser's features and the visitor's own time are used from the next request on, in the same page view; Matomo has no call that turns load times on again within a page view, so they follow from the next one.

### The legitimate interest test

The EDPB names three conditions, each to be met, assessed and written down before the counting starts ([Guidelines 1/2024](https://www.edpb.europa.eu/public-consultations/guidelines-12024-on-processing-of-personal-data-based-on-article-61f-gdpr_en), paragraph 6):

1. **A legitimate interest.** Knowing how many people visit the site, which pages they read and where they come from, so that the site can be made better. It is lawful, precise and real now.
2. **Necessity.** Counting is necessary for that interest when nothing less intrusive gives it. The site counts with no identifier kept between visits, reads nothing of the device, shortens the IP address before it is kept, keeps the data in its own instance and shares it with no one, and stops for a visitor who objects. A web server's own log would give page views, but not downloads, clicks on other sites' links or the pages' titles, and is kept by another system.
3. **Balancing.** The visitor's interests must not override the site's. The GDPR asks what a visitor can reasonably expect ([recital 47](https://eur-lex.europa.eu/eli/reg/2016/679/oj)). A visitor can expect a site to count its visits; the counting identifies no one, follows no one between visits or sites, builds no profile, is kept for a limited time, and can be stopped with one click.

The site must also say, in its privacy policy, that it relies on a legitimate interest and what that interest is (Article 13(1)(c) and (d)), and that the visitor may object (Article 13(2)(b)).

### The risk that remains

The measurement request itself may fall under the ePrivacy rule. The EDPB holds that a script which instructs the browser to send a request with information is "gaining of access" in the sense of Article 5(3), and that the distribution of such a script is the instruction ([Guidelines 2/2023](https://www.edpb.europa.eu/documents/guideline/guidelines-22023-on-technical-scope-of-art-53-of-eprivacy-directive_en), paragraphs 32, 33 and 51); an IP address from the visitor's router or an IPv6 address counts as information from the device (paragraph 55). The EDPB adds that the rule applying does not by itself mean that consent is needed, and that each exemption must be assessed (paragraph 56). The server-log principle keeps the request to what any request carries, but the page's script still makes it. This is a deliberate risk: the owner decides to take it, and writes the decision down with the assessment above.

The French supervisory authority, the CNIL, exempts trackers used for audience measurement from consent where they serve that purpose alone, for the publisher's own account, produce anonymous statistics only, are not combined with other processing or passed to third parties, and do not follow a visitor across sites or apps. It recommends a lifetime of 13 months for such a tracker, and keeping what it collects for at most 25 months ([CNIL, *Cookies : solutions pour les outils de mesure d'audience*, 4 July 2025](https://www.cnil.fr/fr/cookies-solutions-pour-les-outils-de-mesure-daudience)). That supports the view that counting visits can be strictly necessary, but it is French practice under French law, Article 82 of the *loi Informatique et Libertés*; another member state's authority may judge otherwise.

## The right to object

A visitor may object at any time to processing that rests on a legitimate interest, and the controller then stops unless it shows compelling legitimate grounds (GDPR, [Article 21(1)](https://eur-lex.europa.eu/eli/reg/2016/679/oj)). The right must be brought to the visitor's attention, clearly and apart from other information (Article 21(4)), and online it may be exercised by automated means using technical specifications (Article 21(5)). An objection by mail cannot be followed here: a visit counted without an identifier cannot be found again. So the consent offers it in the browser, wherever the site declares the departure:

- **In the privacy settings**, at the end of the statistics category's services, a short explanation and a link, *Don't count my visits*.
- **In the cookie declaration**, beside the buttons that change and withdraw the choice.
- **In a page of the site's own**, such as the privacy policy: `ConsentControls.astro` with `objection` places the same link, and a page Konzilo does not build places `<a href="#konzilo-consent-objection" data-konzilo-consent-action="objection" hidden>` ([the page's contract](site-design.md#the-consent-on-a-page-konzilo-does-not-build)).

The link opens a confirmation with a plain appeal and two buttons alike, *Don't count my visits* and *Cancel*. To a visitor who has allowed statistics the appeal says that the browser is recognised between visits now, and that objecting turns that off too. Confirming keeps the objection in the consent's own storage, the same cookie or local storage item as the choice, on the same domain, for 12 months. From then on Matomo sends nothing, in the same page view too, and sets no cookie for it: Konzilo calls Matomo's `requireConsent`, which holds back every request, rather than `optUserOut`, which writes a cookie of Matomo's own. An objection always turns statistics off: where the visitor had allowed them, confirming withdraws that consent as Withdraw consent does, and removes the tracker's cookies. The link then says *Count my visits again*, which takes the objection back. Allowing statistics later ends the objection; Withdraw consent clears it with every consent, and the visitor is counted without storage as at a first visit.

An objection lives in one browser. A visitor who uses several browsers, or clears what the site stored, objects again; the privacy policy should say so.

Global Privacy Control and Do Not Track are signals a browser sends. With `privacySignals: "stop"` such a browser is not counted at all; with `"ignore"` it is counted without storage like any other. A supervisory authority could read Global Privacy Control as an objection by automated means under Article 21(5), so the choice between the two belongs in the assessment.

## Which reports cover whom

Reports made from what every request carries cover every visitor counted: visits, page views, pages and their titles, entry and exit pages, referring sites, search engines and campaigns, downloads, clicks on other sites' links, countries and regions, types of device, families of browsers and operating systems, languages, and the time of day in the site's time zone.

Reports that need the visitor recognised between visits, or something read from the device, cover only the visitors who allow statistics: new and returning visitors, unique visitors over days, weeks or months, how often and how recently a visitor comes back, screen sizes, versions of browsers and operating systems, models of devices, the browser's features, the visitor's local time, and load times. Read them as a sample of the consenting visitors, not of all.

Neither kind counts a visitor who objects, nor, with `privacySignals: "stop"`, a browser that sends Global Privacy Control or Do Not Track.

## Matomo settings to check

The JavaScript does its part; these are Matomo's, set in its administration ([Configure privacy settings in Matomo](https://matomo.org/faq/general/configure-privacy-settings-in-matomo/)):

- **IP addresses shortened by two bytes.** *Administration › Privacy › Anonymize data*: anonymise visitors' IP addresses, with 2 bytes masked.
- **The shortened address used for geolocation.** In the same view, choose *Yes* for using the anonymised IP addresses when enriching visits, so that country and region come from the shortened address.
- **Raw data deleted after 25 months.** In the same view, *Regularly delete old raw data*, after 761 days. This is the CNIL's benchmark for audience measurement, often used as a yardstick elsewhere; Matomo itself advises 3 to 6 months, and a shorter period is easier to defend. The reports archived from the raw data hold totals and stay.
- **Matomo's own Do Not Track support off** where the site counts regardless of privacy signals, `privacySignals: "ignore"`. *Administration › Privacy › Users opt-out*, *Support Do Not Track preference*. Left on, Matomo would drop those visits on its server, and the cookie declaration would say otherwise. Matomo has deprecated the setting. With `"stop"` the site loads nothing for such a browser, and the setting changes nothing.
- **The site's time zone** in Matomo, *Websites › Manage*, the same as the tag manager's *Time zone* in Konzilo.

## Turning it on

In `site-description.json`, under `consent.departures`, declare the departure with its reason, which the cookie declaration shows, and what privacy signals do:

```json
{
  "departure": "statisticsWithoutStorageBeforeConsent",
  "reason": "We need to know how many people visit the site and which pages they read, so that we can improve it. The counting rests on our legitimate interest (Article 6(1)(f) GDPR) and reads nothing from your device beyond what your browser sends anyway.",
  "privacySignals": "ignore"
}
```

On the *Site settings* page, choose *Matomo* as the tag manager, with Matomo's address, the site's ID and its time zone. The consent texts for the right to object are among the *Consent texts*, each with a default in English and Swedish.

## Example wording

Each text is a suggestion to fit to the site. Words in square brackets are the site's own. Do not call the counting *anonymous*: until the raw data is deleted it is personal data, and Konzilo's own texts never use the word.

### The privacy policy

> **Visitor statistics.** We count visits to the site with Matomo, which [we run ourselves | [name] runs for us in [country]]. From your first page we count each visit without storing anything in your browser, and without reading anything from your device beyond what your browser sends with every request: the address and title of the page, the page you came from, the kind of browser, operating system and device you use, your language, and the country and region your shortened IP address points to. We shorten your IP address by two bytes before it is kept, and we cannot see who you are. The time of day of each visit is kept in our own time zone. We do this on our legitimate interest in knowing how the site is used, so that we can improve it (Article 6(1)(f) GDPR). If you allow statistics, Matomo also stores a cookie in your browser, so that it can tell new visitors from returning ones, and reads your screen size, details of your device and how fast the page loaded; you can withdraw that consent at any time. We delete the raw data after [25 months]. The reports made from it hold totals alone.
>
> **Your right to object.** You may object to being counted at any time, with the link *Don't count my visits* [here | in the privacy settings, under Statistics]. Your objection is kept in your browser for 12 months, and from then on nothing about your visits is sent to Matomo. Since we cannot see who you are, we can only honour an objection made this way, in each browser you use. If you allow statistics later, or clear what the site has stored in your browser, the objection ends.

> **Besöksstatistik.** Vi räknar besöken på webbplatsen med Matomo, som [vi driver själva | [namn] driver åt oss i [land]]. Från din första sida räknar vi varje besök utan att lagra något i din webbläsare, och utan att läsa något från din enhet utöver det som webbläsaren ändå skickar med varje förfrågan: sidans adress och rubrik, sidan du kom från, vilken sorts webbläsare, operativsystem och enhet du använder, ditt språk och det land och den region som din förkortade IP-adress pekar på. Vi förkortar IP-adressen med två byte innan den sparas, och vi kan inte se vem du är. Klockslaget för varje besök sparas i vår egen tidszon. Vi gör det med stöd av vårt berättigade intresse av att veta hur webbplatsen används, så att vi kan göra den bättre (artikel 6.1 f i dataskyddsförordningen). Om du tillåter statistik lagrar Matomo också en kaka i din webbläsare, så att den kan skilja nya besökare från återkommande, och läser av din skärmstorlek, uppgifter om din enhet och hur snabbt sidan laddades. Det samtycket kan du när som helst återkalla. Vi raderar rådata efter [25 månader]. Rapporterna som görs av dem innehåller bara summor.
>
> **Din rätt att invända.** Du kan när som helst invända mot att bli räknad, med länken *Räkna inte mina besök* [här | i integritetsinställningarna, under Statistik]. Invändningen sparas i din webbläsare i 12 månader, och från och med då skickas ingenting om dina besök till Matomo. Eftersom vi inte kan se vem du är kan vi bara ta hänsyn till en invändning som görs på det sättet, i varje webbläsare du använder. Om du tillåter statistik senare, eller rensar det som webbplatsen har lagrat i din webbläsare, upphör invändningen.

### The cookie policy

> This site stores in your browser only what it needs to work and to remember your choice, unless you allow more. Before you make a choice, its statistics count your visit without storing anything in your browser; our [privacy policy] says what is counted, and you can object with the link *Don't count my visits*. Your choice holds for 12 months on [this site | every site below [domain]], and you can change it or withdraw it at the bottom of every page.

> Webbplatsen lagrar bara det i din webbläsare som den behöver för att fungera och för att komma ihåg ditt val, om du inte tillåter mer. Innan du har gjort ett val räknar statistiken ditt besök utan att lagra något i din webbläsare. Vår [integritetspolicy] säger vad som räknas, och du kan invända med länken *Räkna inte mina besök*. Ditt val gäller i 12 månader på [den här webbplatsen | varje webbplats under [domän]], och du kan ändra eller återkalla det längst ned på varje sida.

### Above the generated table

The cookie declaration follows the cookie policy's body, so the body's last paragraph stands just above it.

> Below is your own choice, which you can change or withdraw there, and then every service the site uses, category by category: who provides it, what it is for, which addresses your browser contacts, whether data leaves the EU and EEA, and what it stores in your browser and for how long. The list is made from the same facts as the privacy settings, so the two always agree.

> Nedan står ditt eget val, som du kan ändra eller återkalla där, och sedan varje tjänst som webbplatsen använder, kategori för kategori: vem som tillhandahåller den, vad den används till, vilka adresser din webbläsare kontaktar, om uppgifter lämnar EU och EES, och vad den lagrar i din webbläsare och hur länge. Listan görs av samma uppgifter som integritetsinställningarna, så de stämmer alltid överens.

### Below the generated table

On a page of Konzilo's the declaration ends the page, so this goes where the site's template places text after it; on a page Konzilo does not build, after the element marked `data-konzilo-consent-declaration`.

> Your browser may also keep things the site does not ask it to, such as its cache. You can remove what a site has stored in your browser's settings; that also removes your choice and any objection, and the site will ask again. Questions about this policy: [contact].

> Din webbläsare kan också spara sådant som webbplatsen inte ber om, till exempel sin cache. Du kan ta bort det som en webbplats har lagrat i webbläsarens inställningar. Då försvinner också ditt val och en eventuell invändning, och webbplatsen frågar igen. Frågor om den här policyn: [kontakt].
