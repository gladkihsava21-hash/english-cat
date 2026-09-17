// Сгенерировано tools/build_verbs.py — руками не править.
// Английские глаголы во всех школьных формах: те слова словаря,
// чей русский перевод — инфинитив, плюс неправильные и служебные.
// Нужен js/grammarcheck.js, чтобы отличать предложение без
// сказуемого от предложения с редким глаголом.
const EN_VERBS = new Set(`
  abandon abandoned abandoning abandonned abandonning abandons abduct abducted abducting abducts
  abide abided abides abiding abolish abolished abolishes abolishing absolve absolved absolves
  absolving absorb absorbed absorbing absorbs accelerate accelerated accelerates accelerating
  accept accepted accepting accepts accommodate accommodated accommodates accommodating
  accompanied accompanies accompany accompanyed accompanying accomplish accomplished
  accomplishes accomplishing accrue accrued accrues accruing accumulate accumulated accumulates
  accumulating accuse accused accuses accusing achieve achieved achieves achieving acknowledge
  acknowledged acknowledges acknowledging acquire acquired acquires acquiring activate activated
  activates activating adapt adapted adapting adapts add added addedded addedding addeded
  addeding addeds adding adds addsed addses addsing adhere adhered adheres adhering adjourn
  adjourned adjourning adjourns adjust adjusted adjusting adjusts administer administered
  administering administerred administerring administers admire admired admires admiring admit
  admited admiting admits admitted admitting adopt adopted adopting adopts adore adored adores
  adoring advertise advertised advertises advertising advise advised advises advising advocate
  advocated advocates advocating affect affected affectedded affectedding affecteded affecteding
  affecteds affecting affectinged affectinging affectings affects affectsed affectses affectsing
  affirm affirmed affirming affirms afford afforded affording affords again agained againing
  agains align aligned aligning aligns alleviate alleviated alleviates alleviating allocate
  allocated allocates allocating allow allowed allowedded allowedding alloweded alloweding
  alloweds allowing allows allowsed allowses allowsing alter altered altering alterred alterring
  alters am amaze amazed amazes amazing amed amend amended amending amends aming ams amuse
  amused amuses amusing analyse analysed analyses analysing analyze analyzed analyzes analyzing
  annihilate annihilated annihilates annihilating announce announced announces announcing annoy
  annoyed annoying annoys answer answered answeredded answeredding answereded answereding
  answereds answering answeringed answeringing answerings answerred answerring answers answersed
  answerses answersing anticipate anticipated anticipates anticipating apologize apologized
  apologizes apologizing appear appeared appearedded appearedding appeareded appeareding
  appeareds appearing appears appearsed appearses appearsing append appended appending appends
  applaud applauded applauding applauds applied applies apply applyed applying appoint appointed
  appointing appoints appreciate appreciated appreciates appreciating appropriate appropriated
  appropriates appropriating approve approved approves approving are ared ares arguablied
  arguablies arguably arguablyed arguablying argue argued argues arguing aring arise arised
  arises arising arouse aroused arouses arousing arrange arranged arranges arranging arrive
  arrived arrives arriving articulate articulated articulates articulating ascend ascended
  ascending ascends ascertain ascertained ascertaining ascertains aside asided asides asiding
  ask asked askedded askedding askeded askeding askeds asking asks asksed askses asksing asleep
  asleeped asleeping asleeps aspire aspired aspires aspiring assemble assembled assembles
  assembling assert asserted asserting asserts assess assessed assesses assessing assign
  assigned assigning assigns assist assisted assisting assists associate associated associates
  associating assume assumed assumes assuming assure assured assures assuring ate atone atoned
  atones atoning attach attached attaches attaching attain attained attaining attains attempt
  attempted attempting attempts attend attended attending attends attract attracted attracting
  attracts authorize authorized authorizes authorizing automate automated automates automating
  avail availed availing avails avenge avenged avenges avenging avoid avoided avoiding avoids
  await awaited awaiting awaits awaken awakened awakening awakenned awakenning awakens babysit
  babysited babysiting babysits babysitted babysitting bake baked bakes baking banish banished
  banishes banishing bark barked barkedded barkedding barkeded barkeding barkeds barking
  barkinged barkinging barkings barks barksed barkses barksing bash bashed bashes bashing bathe
  bathed bathes bathing be beam beamed beaming beams bearing bearinged bearinging bearings beat
  beated beaten beating beats became becamed becames becaming become becomed becomes becomesed
  becomeses becomesing becomessed becomessing becoming bed bedded bedding beded beding beds
  bedtime bedtimed bedtimes bedtiming been beened beening beens befall befalled befalling
  befalls beg began beganed beganing beganned beganning begans beged begged begging begin
  begined beging begining beginned beginning begins beginsed beginses beginsing begs begun
  behave behaved behaves behaving behold beholded beholding beholds being beinged beinging
  beings believe believed believedded believedding believeded believeding believeds believes
  believesed believeses believesing believessed believessing believing belong belonged belonging
  belongs bend bended bending bends bent bes beseech beseeched beseeches beseeching bet beted
  beting bets betted betting beware bewared bewares bewaring bind binded binding binds bing bit
  bite bited bites biting bitten blackjack blackjacked blackjacking blackjacks bleed bleeded
  bleeding bleeds bleep bleeped bleeping bleeps bless blessed blesses blessing blew blow blowed
  blowing blown blows bluff bluffed bluffing bluffs blur blured bluring blurred blurring blurs
  blush blushed blushes blushing boast boasted boasting boasts boil boiled boiling boils boogie
  boogied boogieded boogieding boogieds boogies boogiesed boogieses boogiesing boogiing bore
  bored bores boring borrow borrowed borrowing borrows bossied bossies bossy bossyed bossying
  bother bothered bothering botherred botherring bothers bought boughted boughting boughts
  bounce bounced bounces bouncing brag braged bragged bragging braging brags break breaked
  breaking breaks breathe breathed breathes breathing brew brewed brewing brews bring bringed
  bringing brings bringsed bringses bringsing broaden broadened broadening broadenned
  broadenning broadens broke broken brought broughted broughting broughts browse browsed browses
  browsing budge budged budges budging buff buffed buffing buffs build builded building builds
  buildsed buildses buildsing built builted builting builts burn burned burning burns burnt
  burst bursted bursting bursts buy buyed buying buys buysed buyses buysing bypass bypassed
  bypasses bypassing calculate calculated calculates calculating call called calledded
  calledding calleded calleding calleds calling calls callsed callses callsing came camed cames
  caming can cancel canceled canceling cancelled cancelling cancels caned caning canned canning
  cans capture captured captures capturing carried carrieded carrieding carrieds carries
  carriesed carrieses carriesing carry carryed carrying carryinged carryinging carryings carve
  carved carves carving catch catched catches catching cater catered catering caterred caterring
  caters caught cause caused causedded causedding causeded causeding causeds causes causesed
  causeses causesing causessed causessing causing causinged causinging causings cease ceased
  ceases ceasing celebrate celebrated celebrates celebrating censor censored censoredded
  censoredding censoreded censoreding censoreds censoring censoringed censoringing censorings
  censorred censorring censors censorsed censorses censorsing certified certifies certify
  certifyed certifying change changed changedded changedding changeded changeding changeds
  changes changesed changeses changesing changessed changessing changing changinged changinging
  changings char characterize characterized characterizes characterizing chared charge charged
  charges charging charing charred charring chars chase chased chases chasing chat chated
  chating chats chatted chatting check checked checkedded checkedding checkeded checkeding
  checkeds checking checkinged checkinging checkings checks checksed checkses checksing cheer
  cheered cheering cheers cherish cherished cherishes cherishing chew chewed chewing chews chirp
  chirped chirping chirps choke choked chokes choking choose choosed chooses choosing chop
  choped choping chopped chopping chops chose chosen chuck chucked chucking chuckle chuckled
  chuckles chuckling chucks claim claimed claimedded claimedding claimeded claimeding claimeds
  claiming claiminged claiminging claimings claims claimsed claimses claimsing clap claped
  claping clapped clapping claps clarified clarifies clarify clarifyed clarifying classified
  classifies classify classifyed classifying claw clawed clawing claws clean cleaned cleanedded
  cleanedding cleaneded cleaneding cleaneds cleaning cleaninged cleaninging cleanings cleans
  cleanse cleansed cleanses cleansing climb climbed climbing climbs cling clinged clinging
  clings close closed closes closing coax coaxed coaxes coaxing coincide coincided coincides
  coinciding collaborate collaborated collaborates collaborating collapse collapsed collapses
  collapsing collect collected collectedded collectedding collecteded collecteding collecteds
  collecting collectinged collectinging collectings collects collectsed collectses collectsing
  collide collided collides colliding combine combined combines combining come comed comes
  comesed comeses comesing comessed comessing coming commemorate commemorated commemorates
  commemorating commence commenced commences commencing commend commended commending commends
  commit commited commiting commits committed committing communicate communicated communicates
  communicating commute commuted commutes commuting compare compared compares comparing compel
  compeled compeling compelled compelling compels compensate compensated compensates
  compensating compete competed competes competing compile compiled compiles compiling complain
  complained complaining complains complete completed completes completing complicate
  complicated complicates complicating complied complies comply complyed complying compose
  composed composes composing comprehend comprehended comprehending comprehends compress
  compressed compresses compressing comprise comprised comprises comprising compute computed
  computes computing conceal concealed concealing conceals concede conceded concedes conceding
  conceive conceived conceives conceiving concentrate concentrated concentrates concentrating
  conclude concluded concludes concluding concur concured concuring concurred concurring concurs
  condemn condemned condemning condemns condone condoned condones condoning conduct conducted
  conducting conducts confer confered confering conferred conferring confers confess confessed
  confesses confessing confide confided confides confiding configure configured configures
  configuring confirm confirmed confirming confirms confiscate confiscated confiscates
  confiscating conform conformed conforming conforms confront confronted confronting confronts
  confuse confused confuses confusing congratulate congratulated congratulates congratulating
  conn connect connected connecting connects conned conning conns conquer conquered conquering
  conquers consent consented consenting consents conserve conserved conserves conserving
  consider considered consideredded consideredding considereded considereding considereds
  considering considerred considerring considers considersed considerses considersing consist
  consisted consisting consists consolidate consolidated consolidates consolidating conspire
  conspired conspires conspiring constitute constituted constitutes constituting construct
  constructed constructing constructs consult consulted consulting consults consume consumed
  consumes consuming contain contained containedded containedding containeded containeding
  containeds containing containinged containinging containings contains containsed containses
  containsing contemplate contemplated contemplates contemplating contend contended contending
  contends continue continued continueded continueding continueds continues continuesed
  continueses continuesing continuing contradict contradicted contradicting contradicts
  contribute contributed contributes contributing control controled controling controlled
  controlling controls convene convened convenes convening converge converged converges
  converging converse conversed converses conversing convert converted converting converts
  convey conveyed conveying conveys convince convinced convinces convincing cook cooked
  cookedded cookedding cookeded cookeding cookeds cooking cookinged cookinging cookings cooks
  cooksed cookses cooksing cooperate cooperated cooperates cooperating cope coped copes coping
  correlate correlated correlates correlating correspond corresponded corresponding corresponds
  corroborate corroborated corroborates corroborating cost costed costing costs could coulded
  coulding coulds count counted countedded countedding counteded counteding counteds counting
  countinged countinging countings counts countsed countses countsing cover covered coveredded
  coveredding covereded covereding covereds covering coveringed coveringing coverings coverred
  coverring covers coversed coverses coversing covet coveted coveting covets covetted covetting
  cram cramed craming crammed cramming crams crave craved craves craving crawl crawled crawling
  crawls create created createdded createdding createded createding createds creates createsed
  createses createsing createssed createssing creating credit credited crediting credits
  creditted creditting creep creeped creeping creeps crept cried cries cripple crippled cripples
  crippling criticize criticized criticizes criticizing crouch crouched crouches crouching
  crucified crucifies crucify crucifyed crucifying crumble crumbled crumbles crumbling crunch
  crunched crunches crunching crush crushed crushes crushing cry cryed crying cultivate
  cultivated cultivates cultivating curb curbed curbing curbs customize customized customizes
  customizing cut cuted cuting cuts cutsed cutses cutsing cutted cutting dance danced dances
  dancing dangle dangled dangles dangling dare dared dares daring darn darned darning darns dawn
  dawned dawning dawns dazzle dazzled dazzles dazzling deal dealed dealing deals dealt debate
  debated debates debating debug debuged debugged debugging debuging debugs deceive deceived
  deceives deceiving decide decided decidedded decidedding decideded decideding decideds decides
  decidesed decideses decidesing decidessed decidessing deciding decidinged decidinging
  decidings decipher deciphered deciphering decipherred decipherring deciphers declare declared
  declares declaring decode decoded decodes decoding decorate decorated decorates decorating
  decrease decreased decreases decreasing dedicate dedicated dedicates dedicating deduct
  deducted deducting deducts deem deemed deeming deems defeat defeated defeating defeats defend
  defended defending defends defer defered defering deferred deferring defers defied defies
  define defined defines defining defy defyed defying delete deleted deletes deleting deliver
  delivered delivering deliverred deliverring delivers demand demanded demandedded demandedding
  demandeded demandeding demandeds demanding demandinged demandinging demandings demands
  demandsed demandses demandsing demonstrate demonstrated demonstrates demonstrating denied
  denies denote denoted denotes denoting deny denyed denying depart departed departing departs
  depend depended depending depends depict depicted depicting depicts deploy deployed deploying
  deploys deprive deprived deprives depriving derive derived derives deriving descend descended
  descending descends describe described describedded describedding describeded describeding
  describeds describes describesed describeses describesing describessed describessing
  describing describinged describinging describings deserve deserved deserves deserving design
  designate designated designates designating designed designedded designedding designeded
  designeding designeds designing designinged designinging designings designs designsed
  designses designsing desire desired desires desiring despise despised despises despising
  destroy destroyed destroying destroys detain detained detaining detains detect detected
  detecting detects deter detered detering deteriorate deteriorated deteriorates deteriorating
  determine determined determines determining deterred deterring deters detest detested
  detesting detests detonate detonated detonates detonating develop developed developedded
  developedding developeded developeding developeds developing developinged developinging
  developings developped developping develops developsed developses developsing devise devised
  devises devising devote devoted devotes devoting devour devoured devouring devours diagnose
  diagnosed diagnoses diagnosing dictate dictated dictates dictating did didded didding diddle
  diddled diddles diddling dided diding dids die died dieded dieding dieds dies diesed dieses
  diesing differ differed differentiate differentiated differentiates differentiating differing
  differred differring differs diffuse diffused diffuses diffusing dig diged digged digging
  diging digs diing diminish diminished diminishes diminishing dine dined dines dining disable
  disabled disables disabling disagree disagreed disagrees disagreing disappear disappeared
  disappearing disappears disappoint disappointed disappointing disappoints disapprove
  disapproved disapproves disapproving disarm disarmed disarming disarms discard discarded
  discarding discards discern discerned discerning discerns disclose disclosed discloses
  disclosing disconnect disconnected disconnecting disconnects discourage discouraged
  discourages discouraging discover discovered discovering discoverred discoverring discovers
  discredit discredited discrediting discredits discreditted discreditting discriminate
  discriminated discriminates discriminating discuss discussed discusses discussing disintegrate
  disintegrated disintegrates disintegrating dislike disliked dislikes disliking dismantle
  dismantled dismantles dismantling dismiss dismissed dismisses dismissing dismount dismounted
  dismounting dismounts dispatch dispatched dispatches dispatching dispense dispensed dispenses
  dispensing disperse dispersed disperses dispersing display displayed displayedded
  displayedding displayeded displayeding displayeds displaying displayinged displayinging
  displayings displays displaysed displayses displaysing dispose disposed disposes disposing
  disseminate disseminated disseminates disseminating dissolve dissolved dissolves dissolving
  distinguish distinguished distinguishes distinguishing distract distracted distracting
  distracts distribute distributed distributes distributing disturb disturbed disturbing
  disturbs dive dived divert diverted diverting diverts dives divide divided divides dividing
  diving do dodge dodged dodges dodging doed does doesed doeses doesing doing doinged doinging
  doings dominate dominated dominates dominating donate donated donates donating done doned
  dones doning doubt doubted doubtedded doubtedding doubteded doubteding doubteds doubting
  doubtinged doubtinging doubtings doubts doubtsed doubtses doubtsing douse doused douses
  dousing downhill downhilled downhilling downhills download downloaded downloading downloads
  doze dozed dozes dozing drag draged dragged dragging draging drags drank draw drawed drawing
  drawn draws dream dreamed dreaming dreams dreamt dredge dredged dredges dredging drew drill
  drilled drilling drills drink drinked drinking drinks drive drived driven drives driving drop
  droped droping dropped droppedded droppedding droppeded droppeding droppeds dropping
  droppinged droppinging droppings drops dropsed dropses dropsing drove drunk dub dubbed dubbing
  dubed dubing dubs dug dunk dunked dunking dunks dwell dwelled dwelling dwells earn earned
  earning earns eat eated eaten eating eats eavesdrop eavesdroped eavesdroping eavesdropped
  eavesdropping eavesdrops echo echoed echoeded echoeding echoeds echoes echoesed echoeses
  echoesing echoing echoinged echoinging echoings edit edited editing edits editted editting
  educate educated educates educating eject ejected ejecting ejects elaborate elaborated
  elaborates elaborating elbow elbowed elbowing elbows elect elected electing elects eliminate
  eliminated eliminates eliminating ell elled elling ells elope eloped elopes eloping embark
  embarked embarking embarks embarrass embarrassed embarrasses embarrassing embed embedded
  embedding embeded embeding embeds emerge emerged emerges emerging emit emited emiting emits
  emitted emitting emphasise emphasised emphasises emphasising emphasize emphasized emphasizes
  emphasizing employ employed employing employs empower empowered empowering empowerred
  empowerring empowers enable enabled enables enabling encompass encompassed encompasses
  encompassing encounter encountered encountering encounterred encounterring encounters
  encourage encouraged encourages encouraging encrypt encrypted encrypting encrypts end endanger
  endangered endangering endangerred endangerring endangers ended endedded endedding endeded
  endeding endeds ending endinged endinging endings endorse endorsed endorses endorsing ends
  endsed endses endsing endure endured endures enduring enhance enhanced enhances enhancing
  enjoy enjoyed enjoyedded enjoyedding enjoyeded enjoyeding enjoyeds enjoying enjoyinged
  enjoyinging enjoyings enjoys enjoysed enjoyses enjoysing enlarge enlarged enlarges enlarging
  enlighten enlightened enlightening enlightenned enlightenning enlightens enlist enlisted
  enlisting enlists enrich enriched enriches enriching enroll enrolled enrolling enrolls ensure
  ensured ensures ensuring entail entailed entailing entails entertain entertained entertaining
  entertains entrust entrusted entrusting entrusts equivocate equivocated equivocates
  equivocating eradicate eradicated eradicates eradicating erase erased erases erasing err erred
  erring errs essence essenced essences essencing establish established establishes establishing
  estimate estimated estimatedded estimatedding estimateded estimateding estimateds estimates
  estimatesed estimateses estimatesing estimatessed estimatessing estimating estimatinged
  estimatinging estimatings evacuate evacuated evacuates evacuating evade evaded evades evading
  evaluate evaluated evaluates evaluating evict evicted evicting evicts evolve evolved evolves
  evolving exacerbate exacerbated exacerbates exacerbating exaggerate exaggerated exaggerates
  exaggerating examine examined examines examining exceed exceeded exceeding exceeds excel
  exceled exceling excelled excelling excels excise excised excises excising excite excited
  excites exciting exclaim exclaimed exclaiming exclaims exclude excluded excludes excluding
  excuse excused excuses excusing exist existed existing exists expand expanded expanding
  expands expect expected expecting expects expedite expedited expedites expediting expel
  expeled expeling expelled expelling expels experience experienced experiencedded
  experiencedding experienceded experienceding experienceds experiences experiencesed
  experienceses experiencesing experiencessed experiencessing experiencing experiencinged
  experiencinging experiencings expire expired expires expiring explain explained explainedded
  explainedding explaineded explaineding explaineds explaining explaininged explaininging
  explainings explains explainsed explainses explainsing exploit exploited exploiting exploits
  explore explored explores exploring expose exposed exposes exposing extend extended extending
  extends exterminate exterminated exterminates exterminating extort extorted extorting extorts
  extremelied extremelies extremely extremelyed extremelying face faced facedded facedding
  faceded faceding faceds faces facesed faceses facesing facessed facessing facilitate
  facilitated facilitates facilitating facing facinged facinging facings fade faded fades fading
  fail failed failing fails fall falled fallen falling falls fallsed fallses fallsing fantasize
  fantasized fantasizes fantasizing fart farted farting farts fasten fastened fastening
  fastenned fastenning fastens fear feared fearedded fearedding feareded feareding feareds
  fearing fearinged fearinging fearings fears fearsed fearses fearsing fed feed feeded feeding
  feeds feel feeled feeling feels feelsed feelses feelsing fell felled felling fells felt felted
  felting felts fester festered festering festerred festerring festers fight fighted fighting
  fights figure figured figuredded figuredding figureded figureding figureds figures figuresed
  figureses figuresing figuressed figuressing figuring figuringed figuringing figurings fill
  filled filling fills finalize finalized finalizes finalizing find finded finding finds findsed
  findses findsing fingernail fingernailed fingernailing fingernails five fived fives fiving fix
  fixed fixedded fixedding fixeded fixeding fixeds fixes fixesed fixeses fixesing fixessed
  fixessing fixing fixinged fixinging fixings flap flaped flaping flapped flapping flaps flatter
  flattered flattering flatterred flatterring flatters flaunt flaunted flaunting flaunts fled
  fledded fledding fleded fleding fleds flee fleed fleeing fleeinged fleeinging fleeings flees
  fleesed fleeses fleesing fleing flesh fleshed fleshes fleshing flew flex flexed flexes flexing
  flied flies flinch flinched flinches flinching flirt flirted flirting flirts float floated
  floating floats flog floged flogged flogging floging flogs floss flossed flosses flossing
  flourish flourished flourishes flourishing flown flunk flunked flunking flunks flush flushed
  flushes flushing fly flyed flying focus focused focusedded focusedding focuseded focuseding
  focuseds focuses focusesed focuseses focusesing focusessed focusessing focusing focusinged
  focusinging focusings focussed focussing fold folded folding folds follow followed followedded
  followedding followeded followeding followeds following follows followsed followses followsing
  forbid forbidded forbidding forbided forbiding forbids forecast forecasted forecasting
  forecasts foresee foreseed foresees foreseing forgave forget forgeted forgeting forgets
  forgetted forgetting forgive forgived forgiven forgives forgiving forgot forgotten form formed
  formedded formedding formeded formeding formeds forming forminged forminging formings forms
  formsed formses formsing formulate formulated formulates formulating fortnight fortnighted
  fortnighting fortnights foster fostered fostering fosterred fosterring fosters fought found
  founded founding founds freeze freezed freezes freezing fret freted freting frets fretted
  fretting fried fries frighten frightened frightening frightenned frightenning frightens frisk
  frisked frisking frisks froze frozen fry fryed frying fulfill fulfilled fulfilling fulfills
  function functioned functionedded functionedding functioneded functioneding functioneds
  functioning functioninged functioninging functionings functions functionsed functionses
  functionsing furnish furnished furnishes furnishing garner garnered garnering garnerred
  garnerring garners gasp gasped gasping gasps gather gathered gathering gatherred gatherring
  gathers gave gaved gaves gaving generate generated generates generating get geted geting gets
  getsed getses getsing getted getting give gived given givened givening givenned givenning
  givens gives givesed giveses givesing givessed givessing giving glance glanced glances
  glancing glare glared glares glaring glide glided glides gliding gloat gloated gloating gloats
  go godmother godmothered godmothering godmotherred godmotherring godmothers goed goes goesed
  goeses goesing going goinged goinging goings gone goned gones goning google googled googles
  googling gossip gossiped gossiping gossipped gossipping gossips got goted goting gots gotted
  gotten gottened gottening gottenned gottenning gottens gotting govern governed governing
  governs grab grabbed grabbing grabed grabing grabs graduate graduated graduates graduating
  grant granted granting grants grasp grasped grasping grasps greet greeted greeting greets grew
  grewed grewing grews grieve grieved grieves grieving grind grinded grinding grinds grip griped
  griping gripped gripping grips grovel groveled groveling grovelled grovelling grovels grow
  growed growing grown grows growsed growses growsing guard guarded guardedded guardedding
  guardeded guardeding guardeds guarding guardinged guardinging guardings guards guardsed
  guardses guardsing guess guessed guessedded guessedding guesseded guesseding guesseds guesses
  guessesed guesseses guessesing guessessed guessessing guessing guessinged guessinging
  guessings hack hacked hacking hacks had hadded hadding haded hading hads halt halted halting
  halts hamper hampered hampering hamperred hamperring hampers hand handed handedded handedding
  handeded handeding handeds handing handinged handinging handings hands handsed handses
  handsing hang hanged hanging hangs happen happened happenedded happenedding happeneded
  happeneding happeneds happening happenned happenning happens happensed happenses happensing
  harass harassed harasses harassing has hased hases hasing hassed hassing haunt haunted
  haunting haunts have haved haves having havinged havinging havings head headed headedded
  headedding headeded headeding headeds heading headinged headinging headings heads headsed
  headses headsing heal healed healing heals hear heard hearded hearding heards heared hearing
  hears hearsed hearses hearsing held helded helding helds help helped helpedded helpedding
  helpeded helpeding helpeds helping helps helpsed helpses helpsing hesitate hesitated hesitates
  hesitating hex hexed hexes hexing hid hidden hide hided hides hiding highlight highlighted
  highlighting highlights hijack hijacked hijacking hijacks hike hiked hikedded hikedding
  hikeded hikeding hikeds hikes hikesed hikeses hikesing hikessed hikessing hiking hikinged
  hikinging hikings hinder hindered hindering hinderred hinderring hinders hit hitchhike
  hitchhiked hitchhikes hitchhiking hited hither hithered hithering hitherred hitherring hithers
  hiting hits hitted hitting hold holded holding holds holdsed holdses holdsing hope hoped
  hopedded hopedding hopeded hopeding hopeds hopefullied hopefullies hopefully hopefullyed
  hopefullying hopes hopesed hopeses hopesing hopessed hopessing hoping hopinged hopinging
  hopings hover hovered hovering hoverred hoverring hovers huff huffed huffing huffs hug huged
  hugged hugging huging hugs humiliate humiliated humiliates humiliating hung hunt hunted
  hunting hunts hurried hurries hurry hurryed hurrying hurt hurted hurting hurts identified
  identifies identify identifyed identifying ignite ignited ignites igniting ignore ignored
  ignores ignoring illuminate illuminated illuminates illuminating illustrate illustrated
  illustrates illustrating imagine imagined imagines imagining imitate imitated imitates
  imitating impact impacted impactedded impactedding impacteded impacteding impacteds impacting
  impactinged impactinging impactings impacts impactsed impactses impactsing implement
  implemented implementing implements implied implies implore implored implores imploring imply
  implyed implying impose imposed imposes imposing impound impounded impounding impounds impress
  impressed impresses impressing imprison imprisoned imprisoning imprisonned imprisonning
  imprisons improve improved improvedded improvedding improveded improveding improveds improves
  improvesed improveses improvesing improvessed improvessing improving improvinged improvinging
  improvings include included includedded includedding includeded includeding includeds includes
  includesed includeses includesing includessed includessing including incorporate incorporated
  incorporates incorporating increase increased increasedded increasedding increaseded
  increaseding increaseds increases increasesed increaseses increasesing increasessed
  increasessing increasing increasinged increasinging increasings indemnified indemnifies
  indemnify indemnifyed indemnifying indicate indicated indicates indicating indict indicted
  indicting indicts induce induced induces inducing indulge indulged indulges indulging infer
  infered infering inferred inferring infers infiltrate infiltrated infiltrates infiltrating
  inflict inflicted inflicting inflicts influence influenced influencedded influencedding
  influenceded influenceding influenceds influences influencesed influenceses influencesing
  influencessed influencessing influencing influencinged influencinging influencings inform
  informed informing informs infringe infringed infringes infringing inhale inhaled inhales
  inhaling inherit inherited inheriting inherits inheritted inheritting initialize initialized
  initializes initializing initiate initiated initiates initiating inject injected injecting
  injects inquire inquired inquires inquiring insert inserted inserting inserts insist insisted
  insisting insists inspect inspected inspecting inspects inspire inspired inspires inspiring
  install installed installing installs instruct instructed instructing instructs insure insured
  insures insuring integrate integrated integrates integrating intend intended intending intends
  inter interact interacted interacting interacts intercept intercepted intercepting intercepts
  interconnect interconnected interconnecting interconnects intered interest interested
  interestedded interestedding interesteded interesteding interesteds interesting interestinged
  interestinging interestings interests interestsed interestses interestsing interfere
  interfered interferes interfering intering interpret interpreted interpreting interprets
  interpretted interpretting interred interring interrogate interrogated interrogates
  interrogating interrupt interrupted interrupting interrupts inters intervene intervened
  intervenes intervening intimidate intimidated intimidates intimidating introduce introduced
  introduces introducing intubate intubated intubates intubating invent invented inventing
  invents invest invested investigate investigated investigates investigating investing invests
  invite invited invites inviting invoke invoked invokes invoking involve involved involves
  involving is ised ises ising isolate isolated isolates isolating issue issued issueded
  issueding issueds issues issuesed issueses issuesing issuing issuinged issuinging issuings
  jabber jabbered jabbering jabberred jabberring jabbers jeopardize jeopardized jeopardizes
  jeopardizing jog joged jogged jogging joging jogs join joined joining joins josh joshed joshes
  joshing judge judged judgedded judgedding judgeded judgeding judgeds judges judgesed judgeses
  judgesing judgessed judgessing judging judginged judginging judgings jump jumped jumping jumps
  justified justifies justify justifyed justifying juxtapose juxtaposed juxtaposes juxtaposing
  keep keeped keeping keeps keepsed keepses keepsing kept kepted kepting kepts kill killed
  killedded killedding killeded killeding killeds killing kills killsed killses killsing kiss
  kissed kisses kissing kneel kneeled kneeling kneels knew knewed knewing knews knit knited
  kniting knits knitted knitting know knowed knowing known knowned knowning knowns knows knowsed
  knowses knowsing label labeled labeling labelinged labelinging labelings labelled labelledded
  labelledding labelleded labelleding labelleds labelling labels labelsed labelses labelsing
  laid laided laiding laids lame lamed lames laming land landed landedded landedding landeded
  landeding landeds landing landinged landinging landings lands landsed landses landsing launch
  launched launches launching launder laundered laundering launderred launderring launders lay
  layed laying layinged layinging layings lays laysed layses laysing leach leached leaches
  leaching lead leaded leading leads leak leaked leakedded leakedding leakeded leakeding leakeds
  leaking leakinged leakinging leakings leaks leaksed leakses leaksing learn learned learnedded
  learnedding learneded learneding learneds learning learns learnsed learnses learnsing learnt
  leave leaved leaves leavesed leaveses leavesing leavessed leavessing leaving led left lefted
  lefting lefts lend lended lending lends lent lessen lessened lessening lessenned lessenning
  lessens let leted leting lets letsed letses letsing letted letting liberate liberated
  liberates liberating lick licked licking licks lift lifted lifting lifts light lighted lighten
  lightened lightening lightenned lightenning lightens lighting lights like liked likedded
  likedding likeded likeding likeds likes likesed likeses likesing likessed likessing liking
  limit limited limitedded limitedding limiteded limiteding limiteds limiting limitinged
  limitinging limitings limits limitsed limitses limitsing limitted limitting limp limped
  limping limps linger lingered lingering lingerred lingerring lingers link linked linkedded
  linkedding linkeded linkeding linkeds linking linkinged linkinging linkings links linksed
  linkses linksing list listed listedded listedding listeded listeding listeds listing listinged
  listinging listings lists listsed listses listsing lit live lived livedded livedding liveded
  liveding liveds lives livesed liveses livesing livessed livessing living loathe loathed
  loathes loathing locate located locates locating look looked looking looks loose loosed loosen
  loosened loosening loosenned loosenning loosens looses loosing loot looted looting loots lose
  losed loses losesed loseses losesing losessed losessing losing lost losted losting losts
  lounge lounged lounges lounging love loved lovedded lovedding loveded loveding loveds loves
  lovesed loveses lovesing lovessed lovessing loving madden maddened maddening maddenned
  maddenning maddens made maintain maintained maintaining maintains make maked makes making
  manage managed manages managing manipulate manipulated manipulates manipulating mar mared
  maring mark marked markedded markedding markeded markeding markeds marking markinged
  markinging markings marks marksed markses marksing marred married marries marring marry
  marryed marrying mars marvel marveled marveling marvelled marvelling marvels match matched
  matchedded matchedding matcheded matcheding matcheds matches matchesed matcheses matchesing
  matchessed matchessing matching matchinged matchinging matchings matter mattered matteredded
  matteredding mattereded mattereding mattereds mattering matteringed matteringing matterings
  matterred matterring matters mattersed matterses mattersing maximize maximized maximizes
  maximizing may mayed maying mays mean meaned meaning means meansed meanses meansing meant
  meanted meanting meants measure measured measuredded measuredding measureded measureding
  measureds measures measuresed measureses measuresing measuressed measuressing measuring
  measuringed measuringing measurings meddle meddled meddles meddling meditate meditated
  meditates meditating meet meeted meeting meets meetsed meetses meetsing melt melted melting
  melts memoried memories memorize memorized memorizes memorizing memory memoryed memorying mend
  mended mending mends mention mentioned mentioning mentions mercuried mercuries mercury
  mercuryed mercurying merge merged merges merging mesh meshed meshes meshing met meted meting
  mets metted metting might mighted mighting mights migrate migrated migrates migrating mimic
  mimicced mimiccing mimiced mimicing mimics mind minded mindedded mindedding mindeded mindeding
  mindeds minding mindinged mindinging mindings minds mindsed mindses mindsing mingle mingled
  mingles mingling minimize minimized minimizes minimizing misplace misplaced misplaces
  misplacing misread misreaded misreading misreads mistake mistaked mistaken mistakes mistaking
  mistook misunderstand misunderstanded misunderstanding misunderstands misuse misused misuses
  misusing mitigate mitigated mitigates mitigating mix mixed mixes mixing mock mocked mocking
  mocks model modeled modeling modelinged modelinging modelings modelled modelledded
  modelledding modelleded modelleding modelleds modelling models modelsed modelses modelsing
  modified modifies modify modifyed modifying mother mothered mothering motherred motherring
  mothers motivate motivated motivates motivating mount mounted mounting mounts move moved
  movedded movedding moveded moveding moveds moves movesed moveses movesing movessed movessing
  moving mow mowed mowing mows multiplied multiplies multiply multiplyed multiplying mumble
  mumbled mumbles mumbling munch munched munches munching must musted muster mustered mustering
  musterred musterring musters musting musts nab nabbed nabbing nabed nabing nabs nail nailed
  nailing nails name named namedded namedding nameded nameding nameds names namesed nameses
  namesing namessed namessing naming naminged naminging namings need needed neededded neededding
  neededed neededing neededs needing needs needsed needses needsing negotiate negotiated
  negotiates negotiating nestle nestled nestles nestling nickel nickeled nickeling nickelled
  nickelling nickels nobilitied nobilities nobility nobilityed nobilitying nominate nominated
  nominates nominating note noted notedded notedding noteded noteding noteds notes notesed
  noteses notesing notessed notessing notified notifies notify notifyed notifying noting
  notinged notinging notings nudge nudged nudges nudging number numbered numberedded
  numberedding numbereded numbereding numbereds numbering numberinged numberinging numberings
  numberred numberring numbers numbersed numberses numbersing numeracied numeracies numeracy
  numeracyed numeracying obey obeyed obeying obeys obfuscate obfuscated obfuscates obfuscating
  object objected objectedded objectedding objecteded objecteding objecteds objecting
  objectinged objectinging objectings objects objectsed objectses objectsing oblige obliged
  obliges obliging observe observed observes observing obtain obtained obtaining obtains
  occupied occupies occupy occupyed occupying occur occured occuring occurred occurring occurs
  offend offended offending offends offer offered offeredded offeredding offereded offereding
  offereds offering offerred offerring offers offersed offerses offersing open opened openedded
  openedding openeded openeding openeds opening openned openning opens opensed openses opensing
  operate operated operates operating oppose opposed opposes opposing opt opted optimize
  optimized optimizes optimizing opting opts order ordered orderedded orderedding ordereded
  ordereding ordereds ordering orderinged orderinging orderings orderred orderring orders
  ordersed orderses ordersing organize organized organizes organizing orient oriented orienting
  orients originate originated originates originating ostracize ostracized ostracizes
  ostracizing outline outlined outlines outlining outlive outlived outlives outliving outrun
  outruned outruning outrunned outrunning outruns outsmart outsmarted outsmarting outsmarts
  overcame overcome overcomed overcomes overcoming overdo overdoed overdoes overdoing overhear
  overheared overhearing overhears overlook overlooked overlooking overlooks overpower
  overpowered overpowering overpowerred overpowerring overpowers overreact overreacted
  overreacting overreacts override overrided overrides overriding oversee overseed oversees
  overseing overwrite overwrited overwrites overwriting owe owed owes owing pack packed packing
  packs paid paided paiding paids paint painted painting paints pant panted panting pants parse
  parsed parses parsing part parted partedded partedding parteded parteding parteds participate
  participated participates participating parting partinged partinging partings parts partsed
  partses partsing pass passed passes passing patronize patronized patronizes patronizing
  pattern patterned patternedded patternedding patterneded patterneding patterneds patterning
  patterninged patterninging patternings patterns patternsed patternses patternsing pave paved
  paves paving pay payed paying pays paysed payses paysing peck pecked pecking pecks peddle
  peddled peddles peddling peek peeked peeking peeks peep peeped peeping peeps penetrate
  penetrated penetrates penetrating pep peped peping pepped pepping peps perceive perceived
  perceives perceiving perform performed performing performs perish perished perishes perishing
  permit permited permiting permits permitsed permitses permitsing permitted permittedded
  permittedding permitteded permitteding permitteds permitting permittinged permittinging
  permittings persist persisted persisting persists personalize personalized personalizes
  personalizing persuade persuaded persuades persuading pester pestered pestering pesterred
  pesterring pesters photoshop photoshoped photoshoping photoshopped photoshopping photoshops
  pick picked picking picks picture pictured picturedded picturedding pictureded pictureding
  pictureds pictures picturesed pictureses picturesing picturessed picturessing picturing
  picturinged picturinging picturings pierce pierced pierces piercing place placed placedded
  placedding placeded placeding placeds places placesed placeses placesing placessed placessing
  placing placinged placinging placings plan planed planing planned plannedded plannedding
  planneded planneding planneds planning planninged planninging plannings plans plansed planses
  plansing plant planted plantedded plantedding planteded planteding planteds planting
  plantinged plantinging plantings plants plantsed plantses plantsing play played playedded
  playedding playeded playeding playeds playing plays playsed playses playsing plead pleaded
  pleading pleads pluck plucked plucking plucks point pointed pointedded pointedding pointeded
  pointeding pointeds pointing pointinged pointinging pointings points pointsed pointses
  pointsing poke poked pokes poking polish polished polishes polishing ponder pondered pondering
  ponderred ponderring ponders portray portrayed portraying portrays possess possessed possesses
  possessing postpone postponed postpones postponing pour poured pouring pours pouting poutinged
  poutinging poutings practice practiced practicedded practicedding practiceded practiceding
  practiceds practices practicesed practiceses practicesing practicessed practicessing
  practicing practicinged practicinging practicings practise practised practisedded
  practisedding practiseded practiseding practiseds practises practisesed practiseses
  practisesing practisessed practisessing practising practisinged practisinging practisings
  preach preached preaches preaching predict predicted predicting predicts prefer prefered
  prefering preferred preferredded preferredding preferreded preferreding preferreds preferring
  preferringed preferringing preferrings prefers prefersed preferses prefersing prepare prepared
  prepares preparing prescribe prescribed prescribes prescribing present presented presentedded
  presentedding presenteded presenteding presenteds presenting presentinged presentinging
  presentings presents presentsed presentses presentsing preserve preserved preserves preserving
  pressure pressured pressuredded pressuredding pressureded pressureding pressureds pressures
  pressuresed pressureses pressuresing pressuressed pressuressing pressuring pressuringed
  pressuringing pressurings presume presumed presumes presuming pretend pretended pretending
  pretends prevail prevailed prevailing prevails prevent prevented preventedded preventedding
  preventeded preventeding preventeds preventing preventinged preventinging preventings prevents
  preventsed preventses preventsing price priced pricedded pricedding priceded priceding priceds
  prices pricesed priceses pricesing pricessed pricessing pricing pricinged pricinging pricings
  pried pries print printed printing printinged printinging printings prints proceed proceeded
  proceeding proceeds process processed processedded processedding processeded processeding
  processeds processes processesed processeses processesing processessed processessing
  processing processinged processinging processings proclaim proclaimed proclaiming proclaims
  procure procured procures procuring prod prodded prodding proded proding prods produce
  produced producedded producedding produceded produceding produceds produces producesed
  produceses producesing producessed producessing producing producinged producinging producings
  profit profited profitedded profitedding profiteded profiteding profiteds profiting
  profitinged profitinging profitings profits profitsed profitses profitsing profitted
  profitting progress progressed progressedded progressedding progresseded progresseding
  progresseds progresses progressesed progresseses progressesing progressessed progressessing
  progressing progressinged progressinging progressings prohibit prohibited prohibiting
  prohibits prohibitted prohibitting project projected projectedded projectedding projecteded
  projecteding projecteds projecting projectinged projectinging projectings projects projectsed
  projectses projectsing proliferate proliferated proliferates proliferating prolong prolonged
  prolonging prolongs promise promised promises promising promote promoted promotes promoting
  pronounce pronounced pronounces pronouncing propose proposed proposes proposing prosecute
  prosecuted prosecutes prosecuting prosper prospered prospering prosperred prosperring prospers
  protect protected protectedded protectedding protecteded protecteding protecteds protecting
  protectinged protectinging protectings protects protectsed protectses protectsing protest
  protested protesting protests prove proved proves provide provided providedded providedding
  provideded provideding provideds provides providesed provideses providesing providessed
  providessing providing proving provoke provoked provokes provoking pry pryed prying publish
  published publishes publishing pull pulled pulling pulls pulp pulped pulping pulps punish
  punished punishes punishing purified purifieded purifieding purifieds purifies purifiesed
  purifieses purifiesing purify purifyed purifying purifyinged purifyinging purifyings purpose
  purposed purposes purposesed purposeses purposesing purposessed purposessing purposing pursue
  pursued pursues pursuing push pushed pushes pushing put puted puting puts putsed putses
  putsing putted putter puttered puttering putterred putterring putters putting quack quacked
  quackedded quackedding quackeded quackeding quackeds quacking quackinged quackinging quackings
  quacks quacksed quackses quacksing qualified qualifies qualify qualifyed qualifying question
  questioned questionedded questionedding questioneded questioneding questioneds questioning
  questioninged questioninging questionings questions questionsed questionses questionsing quit
  quited quiting quits quitsed quitses quitsing radiant radianted radianting radiants raise
  raised raises raising ran raned rang ranged ranging rangs raning ranned ranning rans reach
  reached reachedded reachedding reacheded reacheding reacheds reaches reachesed reacheses
  reachesing reachessed reachessing reaching react reacted reacting reacts read readed reading
  reads readsed readses readsing realise realised realises realising realize realized realizes
  realizing reap reaped reaping reaps rear reared rearing rears reason reasoned reasonedded
  reasonedding reasoneded reasoneding reasoneds reasoning reasoninged reasoninging reasonings
  reasonned reasonning reasons reasonsed reasonses reasonsing reassure reassured reassures
  reassuring rebound rebounded rebounding rebounds rebuild rebuilded rebuilding rebuilds recall
  recalled recalling recalls recharge recharged recharges recharging recite recited recites
  reciting reckon reckoned reckoning reckonned reckonning reckons recognize recognized
  recognizes recognizing recommend recommended recommending recommends reconcile reconciled
  reconciles reconciling reconnect reconnected reconnecting reconnects reconsider reconsidered
  reconsidering reconsiderred reconsiderring reconsiders reconstruct reconstructed
  reconstructing reconstructs record recorded recordedded recordedding recordeded recordeding
  recordeds recording recordinged recordinging recordings records recordsed recordses recordsing
  recover recovered recovering recoverred recoverring recovers recreate recreated recreates
  recreating recycle recycled recycles recycling redeem redeemed redeeming redeems redirect
  redirected redirecting redirects redistribute redistributed redistributes redistributing redo
  redoed redoes redoing reduce reduced reducedded reducedding reduceded reduceding reduceds
  reduces reducesed reduceses reducesing reducessed reducessing reducing reducinged reducinging
  reducings refer refered reference referenced referencedded referencedding referenceded
  referenceding referenceds references referencesed referenceses referencesing referencessed
  referencessing referencing referencinged referencinging referencings refering referred
  referring refers refinance refinanced refinances refinancing refine refined refines refining
  reflect reflected reflecting reflects reform reformed reforming reforms refrain refrained
  refraining refrains refresh refreshed refreshes refreshing refuel refueled refueling refuels
  refuse refused refuses refusing regard regarded regarding regards register registered
  registeredded registeredding registereded registereding registereds registering registeringed
  registeringing registerings registerred registerring registers registersed registerses
  registersing regret regreted regreting regrets regretted regretting regroup regrouped
  regrouping regroups regulate regulated regulates regulating rehearse rehearsed rehearses
  rehearsing reimburse reimbursed reimburses reimbursing reinforce reinforced reinforces
  reinforcing reject rejected rejecting rejects rejoice rejoiced rejoices rejoicing relax
  relaxed relaxes relaxing release released releasedded releasedding releaseded releaseding
  releaseds releases releasesed releaseses releasesing releasessed releasessing releasing
  releasinged releasinging releasings relied relies relieve relieved relieves relieving relive
  relived relives reliving reload reloaded reloading reloads relocate relocated relocates
  relocating rely relyed relying remain remained remainedded remainedding remaineded remaineding
  remaineds remaining remains remainsed remainses remainsing remember remembered rememberedded
  rememberedding remembereded remembereding remembereds remembering rememberred rememberring
  remembers remembersed rememberses remembersing remembrance remembranced remembrances
  remembrancing remind reminded reminding reminds remodel remodeled remodeling remodelled
  remodelling remodels remove removed removedded removedding removeded removeding removeds
  removes removesed removeses removesing removessed removessing removing removinged removinging
  removings rename renamed renames renaming render rendered rendering renderred renderring
  renders renew renewed renewing renews renounce renounced renounces renouncing reopen reopened
  reopening reopenned reopenning reopens repair repaired repairing repairs repeal repealed
  repealing repeals repeat repeated repeatedded repeatedding repeateded repeateding repeateds
  repeating repeatinged repeatinging repeatings repeats repeatsed repeatses repeatsing repent
  repented repenting repents rephrase rephrased rephrases rephrasing replace replaced
  replacedded replacedding replaceded replaceding replaceds replaces replacesed replaceses
  replacesing replacessed replacessing replacing replacinged replacinging replacings replied
  replies reply replyed replying report reported reportedded reportedding reporteded reporteding
  reporteds reporting reportinged reportinging reportings reports reportsed reportses reportsing
  represent represented representing represents reproduce reproduced reproduces reproducing
  request requested requestedded requestedding requesteded requesteding requesteds requesting
  requestinged requestinging requestings requests requestsed requestses requestsing require
  required requiredded requiredding requireded requireding requireds requires requiresed
  requireses requiresing requiressed requiressing requiring requiringed requiringing requirings
  rescue rescued rescues rescuing research researched researchedded researchedding researcheded
  researcheding researcheds researches researchesed researcheses researchesing researchessed
  researchessing researching researchinged researchinging researchings resemble resembled
  resembles resembling resent resented resenting resents reside resided resides residing resign
  resigned resigning resigns resist resisted resisting resists resolve resolved resolves
  resolving respect respected respectedded respectedding respecteded respecteding respecteds
  respecting respectinged respectinging respectings respects respectsed respectses respectsing
  respond responded responding responds rest rested restedded restedding resteded resteding
  resteds resting restinged restinging restings restore restored restores restoring restrain
  restrained restraining restrains restrict restricted restricting restricts rests restsed
  restses restsing result resulted resultedded resultedding resulteded resulteding resulteds
  resulting resultinged resultinging resultings results resultsed resultses resultsing resume
  resumed resumes resuming resuscitate resuscitated resuscitates resuscitating retain retained
  retaining retains rethink rethinked rethinking rethinks retire retired retires retiring
  retrieve retrieved retrieves retrieving return returned returning returns reunion reunioned
  reunioning reunions rev reveal revealed revealing reveals reved review reviewed reviewedded
  reviewedding revieweded revieweding revieweds reviewing reviewinged reviewinging reviewings
  reviews reviewsed reviewses reviewsing reving revise revised revises revising revive revived
  revives reviving revoke revoked revokes revoking revs revved revving rewind rewinded rewinding
  rewinds rewrite rewrited rewrites rewriting rid ridded ridden ridding ride rided rides riding
  rids ring ringed ringing ringinged ringinging ringings rings ringsed ringses ringsing rinse
  rinsed rinses rinsing rip riped riping ripped ripping rips rise rised risen risened risening
  risenned risenning risens rises risesed riseses risesing risessed risessing rising risinged
  risinging risings risk risked riskedded riskedding riskeded riskeding riskeds risking
  riskinged riskinging riskings risks risksed riskses risksing roam roamed roaming roams roar
  roared roaring roars rode rose rosed roses rosing rot rotate rotated rotates rotating roted
  roting rots rotted rotting route routed routedded routedding routeded routeding routeds routes
  routesed routeses routesing routessed routessing routing routinged routinging routings rub
  rubbed rubbing rubed rubing rubs ruin ruined ruining ruins rule ruled ruledded ruledding
  ruleded ruleding ruleds rules rulesed ruleses rulesing rulessed rulessing ruling rulinged
  rulinging rulings run runed rung runged runging rungs runing runned running runs runsed runses
  runsing rush rushed rushes rushing safeguard safeguarded safeguarding safeguards sag saged
  sagged sagging saging sags said saided saiding saids sample sampled sampledded sampledding
  sampleded sampleding sampleds samples samplesed sampleses samplesing samplessed samplessing
  sampling samplinged samplinging samplings sang sank sat sated sating satisfied satisfies
  satisfy satisfyed satisfying sats satted satting save saved saves saving saw sawed sawing saws
  say sayed saying says saysed sayses saysing scale scaled scaledded scaledding scaleded
  scaleding scaleds scales scalesed scaleses scalesing scalessed scalessing scaling scalinged
  scalinging scalings scan scaned scaning scanned scanning scans scare scared scaredded
  scaredding scareded scareding scareds scares scaresed scareses scaresing scaressed scaressing
  scaring scaringed scaringing scarings scatter scattered scattering scatterred scatterring
  scatters schedule scheduled scheduledded scheduledding scheduleded scheduleding scheduleds
  schedules schedulesed scheduleses schedulesing schedulessed schedulessing scheduling
  schedulinged schedulinging schedulings scold scolded scolding scolds score scored scores
  scoring scram scramble scrambled scrambles scrambling scramed scraming scrammed scramming
  scrams scratch scratched scratches scratching seal sealed sealing seals search searched
  searchedded searchedding searcheded searcheding searcheds searches searchesed searcheses
  searchesing searchessed searchessing searching searchinged searchinging searchings see seed
  seek seeked seeking seeks seem seemed seemedded seemedding seemeded seemeding seemeds seeming
  seems seemsed seemses seemsing seen seened seening seens sees seesed seeses seesing seine
  seined seines seing seining seize seized seizes seizing select selected selecting selects sell
  selled selling sells send sended sending sends sendsed sendses sendsing sense sensed sensedded
  sensedding senseded senseding senseds senses sensesed senseses sensesing sensessed sensessing
  sensing sensinged sensinging sensings sent sented senting sents serve served servedded
  servedding serveded serveding serveds serves servesed serveses servesing servessed servessing
  service serviced servicedded servicedding serviceded serviceding serviceds services servicesed
  serviceses servicesing servicessed servicessing servicing servicinged servicinging servicings
  serving set seted seting sets setsed setses setsing setted setting settle settled settles
  settling sever severed severing severred severring severs sew sewed sewing sews shake shaked
  shaken shakes shaking shall shalled shalling shalls shape shaped shapedded shapedding shapeded
  shapeding shapeds shapes shapesed shapeses shapesing shapessed shapessing shaping shapinged
  shapinging shapings share shared sharedded sharedding shareded shareding shareds shares
  sharesed shareses sharesing sharessed sharessing sharing sharinged sharinging sharings sharpen
  sharpened sharpening sharpenned sharpenning sharpens shatter shattered shattering shatterred
  shatterring shatters shave shaved shaves shaving shelter sheltered shelteredded shelteredding
  sheltereded sheltereding sheltereds sheltering shelteringed shelteringing shelterings
  shelterred shelterring shelters sheltersed shelterses sheltersing shine shined shines shinesed
  shineses shinesing shinessed shinessing shining shininged shininging shinings ship shiped
  shiping shipped shippedded shippedding shippeded shippeding shippeds shipping shippinged
  shippinging shippings ships shipsed shipses shipsing shone shoned shones shoning shoo shooed
  shooes shooing shook shoot shooted shooting shoots shop shoped shoping shopped shoppedded
  shoppedding shoppeded shoppeding shoppeds shopping shoppinged shoppinging shoppings shops
  shopsed shopses shopsing shortcut shortcuted shortcuting shortcuts shortcutted shortcutting
  shorten shortened shortening shortenned shortenning shortens shot should shoulded shoulding
  shoulds shove shoved shoves shoving show showed showedded showedding showeded showeding
  showeds showing shown shows showsed showses showsing shrink shrinked shrinking shrinks shuffle
  shuffled shuffles shuffling shun shuned shuning shunned shunning shuns shut shuted shuting
  shuts shutted shutting sign signal signaled signaling signalinged signalinging signalings
  signalled signalledded signalledding signalleded signalleding signalleds signalling signals
  signalsed signalses signalsing signed signedded signedding signeded signeding signeds
  signified signifies signify signifyed signifying signing signinged signinging signings signs
  signsed signses signsing simmer simmered simmering simmerred simmerring simmers simplified
  simplifies simplify simplifyed simplifying simulate simulated simulates simulating sing singed
  singing sings sink sinked sinking sinks sip siped siping sipped sipping sips sit sited siting
  sits sitsed sitses sitsing sitted sitting skate skated skates skating skedaddle skedaddled
  skedaddles skedaddling skim skimed skiming skimmed skimming skims skype skyped skypes skyping
  slam slamed slaming slammed slamming slams sleep sleeped sleeping sleeps slept slice sliced
  slices slicing slide slided slides sliding slip sliped sliping slipped slipping slips smash
  smashed smashes smashing smear smeared smearing smears smell smelled smelledded smelledding
  smelleded smelleding smelleds smelling smellinged smellinging smellings smells smellsed
  smellses smellsing smelt smother smothered smothering smotherred smotherring smothers snatch
  snatched snatches snatching sneak sneaked sneaking sneaks sniff sniffed sniffing sniffs snoop
  snooped snooping snoops snore snored snores snoring soak soaked soaking soaks soar soared
  soaring soars soften softened softening softenned softenning softens sold solve solved solves
  solving soothe soothed soothes soothing sort sorted sortedded sortedding sorteded sorteding
  sorteds sorting sortinged sortinging sortings sorts sortsed sortses sortsing sought sound
  sounded soundedded soundedding soundeded soundeding soundeds sounding soundinged soundinging
  soundings sounds soundsed soundses soundsing sourced sourcedded sourcedding sourceded
  sourceding sourceds sources sourcesed sourceses sourcesing sourcessed sourcessing sourcing
  sourcinged sourcinging sourcings spank spanked spanking spanks spat spated spating spats
  spatted spatter spattered spattering spatterred spatterring spatters spatting speak speaked
  speaking speaks speaksed speakses speaksing specialize specialized specializes specializing
  speculate speculated speculates speculating spell spelled spelling spells spelt spend spended
  spending spends spendsed spendses spendsing spent spented spenting spents spill spilled
  spilling spills spilt spin spined spining spinned spinning spins spit spited spiting spits
  spitsed spitses spitsing spitted spitting spittinged spittinging spittings split splited
  spliting splits splitted splitting spoil spoiled spoiling spoils spoke spoked spoken spokes
  spoking sprang spranged spranging sprangs spread spreaded spreading spreads spring springed
  springing springinged springinging springings springs springsed springses springsing sprinkle
  sprinkled sprinkles sprinkling squander squandered squandering squanderred squanderring
  squanders squeeze squeezed squeezes squeezing squirm squirmed squirming squirms squirt
  squirted squirting squirts squish squished squishes squishing stabilize stabilized stabilizes
  stabilizing staff staffed staffedded staffedding staffeded staffeding staffeds staffing
  staffinged staffinging staffings staffs staffsed staffses staffsing stage staged stagedded
  stagedding stageded stageding stageds stages stagesed stageses stagesing stagessed stagessing
  staging staginged staginging stagings stamp stamped stampedded stampedding stampeded
  stampeding stampeds stamping stampinged stampinging stampings stamps stampsed stampses
  stampsing stan stand standard standarded standarding standards standardsed standardses
  standardsing standed standing stands standsed standses standsing staned staning stanned
  stanning stans stare stared stares staring start started startedded startedding starteded
  starteding starteds starting startle startled startles startling starts startsed startses
  startsing state stated statedded statedding stateded stateding stateds states statesed
  stateses statesing statessed statessing stating statinged statinging statings stay stayed
  stayedded stayedding stayeded stayeding stayeds staying stayinged stayinging stayings stays
  staysed stayses staysing steal stealed stealing steals steer steered steering steers step
  steped steping stepmother stepmothered stepmothering stepmotherred stepmotherring stepmothers
  stepped steppedded steppedding steppeded steppeding steppeds stepping steppinged steppinging
  steppings steps stepsed stepses stepsing stick sticked sticking stickinged stickinging
  stickings sticks sticksed stickses sticksing stimulate stimulated stimulates stimulating sting
  stinged stinging stings stir stired stiring stirred stirring stirs stock stocked stockedded
  stockedding stockeded stockeding stockeds stocking stockinged stockinging stockings stocks
  stocksed stockses stocksing stoke stoked stokes stoking stole stolen stomp stomped stomping
  stomps stood stooded stooding stoods stop stoped stoping stopped stoppedded stoppedding
  stoppeded stoppeding stoppeds stopping stops stopsed stopses stopsing store stored storedded
  storedding storeded storeding storeds stores storesed storeses storesing storessed storessing
  storing storinged storinging storings stow stowed stowing stows straighten straightened
  straightening straightenned straightenning straightens strand stranded stranding strands
  streamline streamlined streamlines streamlining strengthen strengthened strengthening
  strengthenned strengthenning strengthens stress stressed stressedded stressedding stresseded
  stresseding stresseds stresses stressesed stresseses stressesing stressessed stressessing
  stressing stressinged stressinging stressings stretch stretched stretches stretching stride
  strided strides striding strike striked strikes strikesed strikeses strikesing strikessed
  strikessing striking strikinged strikinging strikings strive strived strives striving struck
  strucked strucking strucks struggle struggled struggledded struggledding struggleded
  struggleding struggleds struggles strugglesed struggleses strugglesing strugglessed
  strugglessing struggling strugglinged strugglinging strugglings stuck stucked stucking stucks
  studied studieded studieding studieds studies studiesed studieses studiesing study studyed
  studying studyinged studyinging studyings stumble stumbled stumbles stumbling stun stuned
  stung stuning stunned stunning stuns style styled styledded styledding styleded styleding
  styleds styles stylesed styleses stylesing stylessed stylessing styling stylinged stylinging
  stylings submit submited submiting submits submitted submitting subnet subneted subneting
  subnets subnetted subnetting subscribe subscribed subscribes subscribing substantiate
  substantiated substantiates substantiating subtract subtracted subtracting subtracts succeed
  succeeded succeeding succeeds sue sued sues suffer suffered suffering sufferred sufferring
  suffers suffice sufficed suffices sufficing suggest suggested suggesting suggests suing sulk
  sulked sulking sulks sullied sullies sully sullyed sullying summarize summarized summarizes
  summarizing summon summoned summoning summonned summonning summons sung sunk supervise
  supervised supervises supervising supplied supplieded supplieding supplieds supplies
  suppliesed supplieses suppliesing supply supplyed supplying supplyinged supplyinging
  supplyings support supported supportedded supportedding supporteded supporteding supporteds
  supporting supportinged supportinging supportings supports supportsed supportses supportsing
  suppose supposed supposes supposing suppress suppressed suppresses suppressing surface
  surfaced surfacedded surfacedding surfaceded surfaceding surfaceds surfaces surfacesed
  surfaceses surfacesing surfacessed surfacessing surfacing surfacinged surfacinging surfacings
  surprise surprised surprisedded surprisedding surpriseded surpriseding surpriseds surprises
  surprisesed surpriseses surprisesing surprisessed surprisessing surprising surprisinged
  surprisinging surprisings surround surrounded surrounding surrounds survey surveyed
  surveyedded surveyedding surveyeded surveyeding surveyeds surveying surveyinged surveyinging
  surveyings surveys surveysed surveyses surveysing survive survived survives surviving suspect
  suspected suspecting suspects suspend suspended suspending suspends sustain sustained
  sustaining sustains swam swat swated swating swats swatted swatting swear sweared swearing
  swears sweep sweeped sweeping sweeps sweeten sweetened sweetening sweetenned sweetenning
  sweetens swell swelled swelling swells swept swim swimed swiming swimmed swimming swims swing
  swinged swinging swings swipe swiped swipes swiping swore sworn swum swung synchronize
  synchronized synchronizes synchronizing tackle tackled tackles tackling take taked taken
  takened takening takenned takenning takens takes takesed takeses takesing takessed takessing
  taking talk talked talkedded talkedding talkeded talkeding talkeds talking talks talksed
  talkses talksing talon taloned taloning talonned talonning talons tangle tangled tangles
  tangling target targeted targetedded targetedding targeteded targeteding targeteds targeting
  targetinged targetinging targetings targets targetsed targetses targetsing targetted
  targetting taste tasted tastedded tastedding tasteded tasteding tasteds tastes tastesed
  tasteses tastesing tastessed tastessing tasting tastinged tastinging tastings taught taughted
  taughting taughts teach teached teaches teachesed teacheses teachesing teachessed teachessing
  teaching teachinged teachinging teachings tear teared tearing tears tease teased teases
  teasing tell telled telling tells tellsed tellses tellsing tempt tempted temptedded
  temptedding tempteded tempteding tempteds tempting temptinged temptinging temptings tempts
  temptsed temptses temptsing ten tend tended tending tends tened tening tenned tenning tens
  terminate terminated terminates terminating terrified terrifies terrify terrifyed terrifying
  terrorize terrorized terrorizes terrorizing test tested testedded testedding testeded
  testeding testeds testified testifies testify testifyed testifying testing testinged
  testinging testings tests testsed testses testsing thank thanked thanking thanks think thinked
  thinking thinks thinksed thinkses thinksing thought thoughted thoughting thoughts thrash
  thrashed thrashes thrashing threaten threatened threatening threatenned threatenning threatens
  threw thrive thrived thrives thriving throw throwed throwing thrown throws tickle tickled
  tickles tickling tie tied tieded tieding tieds ties tiesed tieses tiesing tighten tightened
  tightening tightenned tightenning tightens tiing tilt tilted tilting tilts time timed timedded
  timedding timeded timeding timeds times timesed timeses timesing timessed timessing timing
  timinged timinging timings tinker tinkered tinkering tinkerred tinkerring tinkers tire tired
  tires tiring toggle toggled toggles toggling told tolded tolding tolds tolerate tolerated
  tolerates tolerating took tooked tooking tooks tore torn touch touched touchedded touchedding
  toucheded toucheding toucheds touches touchesed toucheses touchesing touchessed touchessing
  touching touchinged touchinging touchings tout touted touting touts tow towed towing tows
  track tracked trackedded trackedding trackeded trackeding trackeds tracking trackinged
  trackinging trackings tracks tracksed trackses tracksing trade traded tradedded tradedding
  tradeded tradeding tradeds trades tradesed tradeses tradesing tradessed tradessing trading
  tradinged tradinging tradings trail trailed trailing trails train trained trainedded
  trainedding traineded traineding traineds training traininged traininging trainings trains
  trainsed trainses trainsing trample trampled tramples trampling transcend transcended
  transcending transcends transfer transfered transfering transferred transferredded
  transferredding transferreded transferreding transferreds transferring transferringed
  transferringing transferrings transfers transfersed transferses transfersing transform
  transformed transforming transforms transport transported transportedded transportedding
  transporteded transporteding transporteds transporting transportinged transportinging
  transportings transports transportsed transportses transportsing travel traveled traveling
  travelinged travelinging travelings travelled travelledded travelledding travelleded
  travelleding travelleds travelling travels travelsed travelses travelsing tread treaded
  treading treads treat treated treatedded treatedding treateded treateding treateds treating
  treatinged treatinging treatings treats treatsed treatses treatsing tremble trembled trembles
  trembling trial trialed trialing trialinged trialinging trialings trialled trialledded
  trialledding trialleded trialleding trialleds trials trialsed trialses trialsing tried trieded
  trieding trieds tries triesed trieses triesing trim trimed triming trimmed trimming trims trip
  triped triping tripped trippedded trippedding trippeded trippeding trippeds tripping
  trippinged trippinging trippings trips tripsed tripses tripsing trust trusted trustedded
  trustedding trusteded trusteding trusteds trusting trustinged trustinging trustings trusts
  trustsed trustses trustsing try tryed trying tuck tucked tucking tucks turn turned turnedded
  turnedding turneded turneding turneds turning turns turnsed turnses turnsing twentied twenties
  twenty twentyed twentying twist twisted twisting twists tying tyinged tyinging tyings type
  typed typedded typedding typeded typeding typeds types typesed typeses typesing typessed
  typessing typing typinged typinging typings uncover uncovered uncovering uncoverred
  uncoverring uncovers undead undeaded undeading undeads underestimate underestimated
  underestimates underestimating undergo undergoed undergoes undergoing undermine undermined
  undermines undermining understand understanded understanding understands understandsed
  understandses understandsing understood understooded understooding understoods undertake
  undertaked undertakes undertaking undo undoed undoes undoing undress undressed undresses
  undressing unfold unfolded unfolding unfolds uninstall uninstalled uninstalling uninstalls
  unite united unites uniting unleash unleashed unleashes unleashing unload unloaded unloading
  unloads unlock unlocked unlocking unlocks unpack unpacked unpacking unpacks unravel unraveled
  unraveling unravelled unravelling unravels unsubscribe unsubscribed unsubscribes unsubscribing
  untie untied unties untiing unveil unveiled unveiling unveils unwind unwinded unwinding
  unwinds unwrap unwraped unwraping unwrapped unwrapping unwraps update updated updates updating
  uphold upholded upholding upholds upset upseted upseting upsets upsetsed upsetses upsetsing
  upsetted upsetting upsettinged upsettinging upsettings use used usedded usedding useded
  useding useds uses usesed useses usesing usessed usessing using vacate vacated vacates
  vacating validate validated validates validating value valued valueded valueding valueds
  values valuesed valueses valuesing valuing valuinged valuinging valuings vanish vanished
  vanishes vanishing veer veered veering veers venerate venerated venerates venerating verified
  verifies verify verifyed verifying vie vied vies view viewed viewedded viewedding vieweded
  vieweding vieweds viewing viewinged viewinging viewings views viewsed viewses viewsing viing
  violate violated violates violating visit visited visitedded visitedding visiteded visiteding
  visiteds visiting visitinged visitinging visitings visits visitsed visitses visitsing visitted
  visitting voice voiced voicedded voicedding voiceded voiceding voiceds voices voicesed
  voiceses voicesing voicessed voicessing voicing voicinged voicinging voicings vomit vomited
  vomiting vomits vomitted vomitting vote voted votes voting vouch vouched vouches vouching wade
  waded wades wading wag waged wagged wagging waging wags wait waited waitedded waitedding
  waiteded waiteding waiteds waiting waits waitsed waitses waitsing waive waived waives waiving
  wake waked wakes waking walk walked walkedded walkedding walkeded walkeding walkeds walking
  walks walksed walkses walksing wallow wallowed wallowing wallows wander wandered wandering
  wanderred wanderring wanders wang wanged wanging wangs want wanted wantedded wantedding
  wanteded wanteding wanteds wanting wants wantsed wantses wantsing warm warmed warmedded
  warmedding warmeded warmeding warmeds warming warminged warminging warmings warms warmsed
  warmses warmsing warn warned warning warns was wased wases wash washed washedded washedding
  washeded washeding washeds washes washesed washeses washesing washessed washessing washing
  washinged washinging washings wasing wassed wassing waste wasted wastes wasting watch watched
  watchedded watchedding watcheded watcheding watcheds watches watchesed watcheses watchesing
  watchessed watchessing watching water watered wateredded wateredding watereded watereding
  watereds watering wateringed wateringing waterings waterred waterring waters watersed waterses
  watersing wave waved wavedded wavedding waveded waveding waveds waves wavesed waveses wavesing
  wavessed wavessing waving wavinged wavinging wavings weaken weakened weakening weakenned
  weakenning weakens wear weared wearing wears weave weaved weaves weaving web webbed webbing
  webed webing webs wed wedded wedding weded weding weds weep weeped weeping weeps weigh weighed
  weighing weighs weld welded welding welds went wented wenting wents wept were wered weres
  wering whirl whirled whirling whirls widen widened widening widenned widenning widens will
  willed willing wills wilt wilted wilting wilts win wined wining winned winning wins winsed
  winses winsing wipe wiped wipes wiping wish wished wishedded wishedding wisheded wisheding
  wisheds wishes wishesed wisheses wishesing wishessed wishessing wishing wishinged wishinging
  wishings withdraw withdrawed withdrawing withdraws withhold withholded withholding withholds
  withstand withstanded withstanding withstands witness witnessed witnessedded witnessedding
  witnesseded witnesseding witnesseds witnesses witnessesed witnesseses witnessesing
  witnessessed witnessessing witnessing witnessinged witnessinging witnessings woke woken won
  wonder wondered wonderedded wonderedding wondereded wondereding wondereds wondering
  wonderinged wonderinging wonderings wonderred wonderring wonders wondersed wonderses
  wondersing woned woning wonned wonning wons woo wooed wooes wooing wore work worked workedded
  workedding workeded workeding workeds working works worksed workses worksing worn worried
  worrieded worrieding worrieds worries worriesed worrieses worriesing worry worryed worrying
  worryinged worryinging worryings worth worthed worthing worths would woulded woulding woulds
  wrap wraped wraping wrapped wrapping wraps wrestle wrestled wrestles wrestling wring wringed
  wringing wrings write writed writes writesed writeses writesing writessed writessing writing
  written wrote wroted wrotes wroting xerox xeroxed xeroxes xeroxing yell yelled yelling yells
  yield yielded yielding yields zoom zoomed zooming zooms
`.split(/\s+/).filter(Boolean));
