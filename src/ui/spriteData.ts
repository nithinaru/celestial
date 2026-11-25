// Generated from the Paper sprite sheet (frame 14). Each frame is rows of characters;
// inks has the same shape, one key per character: g ground, t type, p planet, a aurora, f fire.
export type SpriteKind = 'fireball' | 'aurora' | 'iss' | 'stars';
export interface SpriteData { frames: string[][]; inks: string[][] }
export const SPRITES: Record<SpriteKind, SpriteData> = {
 "fireball": {
  "frames": [
   [
    "                                  ",
    "                                  ",
    "     .=-.                         ",
    "        -**=-::.                  ",
    "         .-*%%@#-.                ",
    "           .-%@#-.                ",
    "            .:::.                 ",
    "                                  ",
    "                                  ",
    "                                  ",
    "                                  ",
    "                                  "
   ],
   [
    "                                  ",
    "   ..    .                        ",
    "     .=-.                         ",
    "    .   :++:.                     ",
    "       .  .=#*=:.                 ",
    "            .-*%%*=-:.            ",
    "               :+#@@@*:           ",
    "                 :=%@*:           ",
    "                  ..:.            ",
    "                                  ",
    "                                  ",
    "                                  "
   ],
   [
    "      .                           ",
    "   ..                             ",
    "      .:                          ",
    "        ...                       ",
    "            *+:.  .               ",
    "          .  .=**=:.   ..         ",
    "                :+##+-..          ",
    "               .  .=*%%#+-:..     ",
    "                    .:+#@@@#-.    ",
    "                       :=#@%=.    ",
    "                        .:::.     ",
    "                                  "
   ],
   [
    "     ..                           ",
    "                                  ",
    "   .   .                          ",
    "        ..     .                  ",
    "     . .    +..  .                ",
    "              -*.:..  .           ",
    "           .     =*.=. .   .      ",
    "                    +.#+-.        ",
    "                     .-*%%*=:.    ",
    "                        :=#%%#+-:.",
    "                          .-+%@@@*",
    "                         .. .:=%%+"
   ]
  ],
  "inks": [
   [
    "gggggggggggggggggggggggggggggggggg",
    "gggggggggggggggggggggggggggggggggg",
    "gggggppppggggggggggggggggggggggggg",
    "ggggggggppffffffgggggggggggggggggg",
    "gggggggggfffttttffgggggggggggggggg",
    "gggggggggggfftttffgggggggggggggggg",
    "ggggggggggggfffffggggggggggggggggg",
    "gggggggggggggggggggggggggggggggggg",
    "gggggggggggggggggggggggggggggggggg",
    "gggggggggggggggggggggggggggggggggg",
    "gggggggggggggggggggggggggggggggggg",
    "gggggggggggggggggggggggggggggggggg"
   ],
   [
    "gggggggggggggggggggggggggggggggggg",
    "gggppggggpgggggggggggggggggggggggg",
    "gggggppppggggggggggggggggggggggggg",
    "ggggpgggpppppggggggggggggggggggggg",
    "gggggggpggpppffffggggggggggggggggg",
    "ggggggggggggffffffffffgggggggggggg",
    "gggggggggggggggffftttffggggggggggg",
    "gggggggggggggggggffttffggggggggggg",
    "ggggggggggggggggggffffgggggggggggg",
    "gggggggggggggggggggggggggggggggggg",
    "gggggggggggggggggggggggggggggggggg",
    "gggggggggggggggggggggggggggggggggg"
   ],
   [
    "ggggggpggggggggggggggggggggggggggg",
    "gggppggggggggggggggggggggggggggggg",
    "ggggggppgggggggggggggggggggggggggg",
    "ggggggggpppggggggggggggggggggggggg",
    "ggggggggggggppppggfggggggggggggggg",
    "ggggggggggpggppppfffgggffggggggggg",
    "ggggggggggggggggffffffffgggggggggg",
    "gggggggggggggggfggfffffffffffggggg",
    "ggggggggggggggggggggffffttttffgggg",
    "gggggggggggggggggggggggfftttffgggg",
    "ggggggggggggggggggggggggfffffggggg",
    "gggggggggggggggggggggggggggggggggg"
   ],
   [
    "gggggppggggggggggggggggggggggggggg",
    "gggggggggggggggggggggggggggggggggg",
    "gggpgggpgggggggggggggggggggggggggg",
    "ggggggggppgggggpgggggggggggggggggg",
    "gggggpgpggggpppggpgggggggggggggggg",
    "ggggggggggggggppppppggfggggggggggg",
    "gggggggggggpgggggpppffgfgggfgggggg",
    "ggggggggggggggggggggffffffgggggggg",
    "gggggggggggggggggggggfffffffffgggg",
    "ggggggggggggggggggggggggffffffffff",
    "ggggggggggggggggggggggggggfffttttf",
    "gggggggggggggggggggggggggffgfffttf"
   ]
  ]
 },
 "aurora": {
  "frames": [
   [
    "               .:-:.             .:-... ",
    "..             .-=-:.            .-=:...",
    "::.           .:===:.           ..-=:.::",
    ":-.           .:=+=-..          ..=+-.:-",
    "--:...        .-+*+=:..        .::=*-:-=",
    "-=:..:.      .:-+**=:...       :::+*=:=+",
    "=+-.:-:.    ..:=*#*+-:.:.      ---*#=:=*",
    "=*-.:=-.    ::-+#%#+-:::-.    :=--*%+:+*",
    "+*=:-+=:...:--=*@@%*=::-=-    -+==#@+-+#",
    "+#=:-*+-::-===+@@@@*=--=+=:  .=*++@@*=*@",
    "*%+:=#*-:=+*++    @#+--+**-..:*#*#  %+%@",
    "%@*-=%#=-+#%#      @*==*%%+:.-#@      @@",
    "@@*-+@@*+#@@        %+*%@@#-:=@@        ",
    " @%=*@@   @               @+-*@         ",
    "  @*@                      %+@          ",
    "                                        "
   ],
   [
    "             .....             ..::.    ",
    "             ::....            ..--...  ",
    ".           .-:.....          ..:==:... ",
    ":.          :--:.:::.         :::=+:.:: ",
    ":....      .==-:::--:.       .-::++:.--.",
    "-:..::     :++=:::-=-.       :=--**-:-=:",
    "=-.:--.   .=**+-:-===:.      -+--**-:=+-",
    "+-::==:.  :+##+-:-=++-..    .=*==##=:+*=",
    "+=::++-...-#@@#=-=+*+-:..   .+#++%%=-+#+",
    "*=:-+*+:.:+%@@@+-=*#*=:::. .:#%**@@+-*%*",
    "#+:-*%*-:-*@    ++*##+--=-:.-%@   @*=%@%",
    "%+-=#@%+-+@     #*#%%*==++-:=@     @*@@@",
    "%*-+@@@#+%       %@@@#++##+-*           ",
    "@#=#               @@  %@@#+            ",
    "@@#                      @@             ",
    "                                        "
   ],
   [
    "            ...              ...::.     ",
    "            .::.             :..--.     ",
    ".          .:--:.           .-.:--:..   ",
    "..         .-==:....        :-::==:...  ",
    "::..      .:-==-...:.       -=:-++:.::  ",
    "-:...    ..:=++=:.:-:      .=+--++-.:-. ",
    "=-..:.  .::-+**=:.:--.     :**--**-:-=- ",
    "=-::--:.::-=+##+-:-==.    .-##==##=:-+=.",
    "+=::-==---=+#%#+-:-++:.   .-%%++%#=:=*+-",
    "*=--=+++++*%@@%*-:=**-...::=@@#*@%+-=##=",
    "*+-=+#####   @@#=-=##=:----*@   @@*=+%%+",
    "#+=+#@@@@     @%=-+%%+-=++=@     @#+#@@#",
    "%#*# @@        @+=*@@*=+##*           @@",
    "@@              #+%@ @*#@@              ",
    "@                                       ",
    "                                        "
   ],
   [
    "                            .....       ",
    ".            .             .:..::.      ",
    "..       .......           --..:-:.     ",
    "::       ::..:::..        .==::---.     ",
    "--.     :--..:-:...       :+=::-=-:.    ",
    "==:.   .==-::-=-..:.     .-*+-:=+=:..   ",
    "++-.  .-+*=::-==::-:     .=#*-:=*+-..   ",
    "**=:..:=##+-:=+=::==.   .:+%#--+*+-::.  ",
    "##+-::-*@@*--+*+::=+:. .::*@%=-+#*=:::. ",
    "#%*=:-+%@@%=-+*+--+*-.:-=-%@@*=*%#+---: ",
    "%@#+==#@   +=*#*--*#=:-+++    +#@%+--==:",
    "@@@#+*      +#%#==#%+-+##      @@@#+=++=",
    "@           %%@#=+@@*=#@        @@@#*##*",
    "             @@@*#@ @*@              @@%",
    "               @                       @",
    "                                        "
   ]
  ],
  "inks": [
   [
    "gggggggggggggggpppppgggggggggggggppppppg",
    "ppgggggggggggggppppppggggggggggggppppppp",
    "pppgggggggggggpppppppgggggggggggpppppppp",
    "pppgggggggggggpaaaapppggggggggggppaaappp",
    "ppppppggggggggpaaaaapppggggggggppaaaaapp",
    "appppppggggggpaaaaaaapppgggggggpaaaaaaaa",
    "aappppppggggppaaaaaaaapppggggggpaaaaaaaa",
    "aaaappppggggpaaaaaaaaaapppggggpaaaaaaaaa",
    "aaaaaaappppppaattaaaaaaappggggpaaaaaaaaa",
    "aaaaaaaaapppaattttaaaaaaappggpaaaatttaaa",
    "aaaaaaaaaaaaatggggtaaaaaaappppaattggtatt",
    "taaaaaaaaaaatggggggttaataaappaatggggggtt",
    "ttaaatttttttggggggggttttttaaaattgggggggg",
    "gttatttgggtgggggggggggggggtaattggggggggg",
    "ggtttggggggggggggggggggggggtttgggggggggg",
    "gggggggggggggggggggggggggggggggggggggggg"
   ],
   [
    "gggggggggggggpppppgggggggggggggpppppgggg",
    "gggggggggggggppppppggggggggggggpppppppgg",
    "pgggggggggggppppppppggggggggggpppppppppg",
    "ppggggggggggppaapppppgggggggggppaaappppg",
    "pppppggggggppaaaapppppgggggggppaaaaapppp",
    "ppppppgggggpaaaaaappppgggggggpaaaaaaaapp",
    "pppppppgggppaaaaaaaapppggggggpaaaaaaaaap",
    "aaaappppggpaaaaaaaaaapppggggpaaaaaaaaaaa",
    "aaaaaappppaatttaaaaaaaappgggpaaaaaaaaaaa",
    "aaaaaaaapaatttttaaaaaaaappgpaatttttaaaaa",
    "aaaaaaaaaattggggaaaaaaaappppaatgggttattt",
    "aaaaattaaatgggggttaaaaaaaapaatgggggttttt",
    "aaaattttttgggggggttttttaaaaatggggggggggg",
    "taatgggggggggggggggttggttttagggggggggggg",
    "tttggggggggggggggggggggggttggggggggggggg",
    "gggggggggggggggggggggggggggggggggggggggg"
   ],
   [
    "ggggggggggggpppggggggggggggggppppppggggg",
    "ggggggggggggppppgggggggggggggppppppggggg",
    "pggggggggggppppppgggggggggggpppppppppggg",
    "ppgggggggggpppppppppggggggggppaaapppppgg",
    "ppppggggggppaapppppppgggggggpaaaaappppgg",
    "pppppggggppaaaaapppppggggggpaaaaaaaapppg",
    "ppppppggppaaaaaaapppppgggggpaaaaaaaaappg",
    "aaaapppppaaaaaaaaaaappggggpaaaaaaaaaaapp",
    "aaaaapppaaattaaaaaaaappgggpaataaaaaaaaap",
    "aaaaaaaaaattttaaaaaaaappppaatttttaaaaaaa",
    "aaaaaaaattgggttaaaaaaaapppattgggttaaaaaa",
    "aaaatttttgggggtaaaaaaaaaaaatgggggtttttta",
    "atttgttggggggggttattttaaattgggggggggggtt",
    "ttggggggggggggggttttgtttttgggggggggggggg",
    "tggggggggggggggggggggggggggggggggggggggg",
    "gggggggggggggggggggggggggggggggggggggggg"
   ],
   [
    "ggggggggggggggggggggggggggggpppppggggggg",
    "pggggggggggggpgggggggggggggpppppppgggggg",
    "ppgggggggpppppppgggggggggggppppppppggggg",
    "ppgggggggpppppppppggggggggppaapppppggggg",
    "pppgggggpppppppppppgggggggpaaaaappppgggg",
    "ppppgggppaaappppppppgggggppaaaaaaapppggg",
    "aappggppaaaaaappppppgggggpaaaaaaaaappggg",
    "aaappppaaaaaaaaaaaappgggpaaaaaaaaaaappgg",
    "aaaaapaattaaaaaaaaaappgppaattaaaaaaaappg",
    "aaaaaaattttaaaaaaaaaapppaattttaaaaaaaapg",
    "aataaattgggtaaaaaaaaaapaatggggtaaaaaaapp",
    "ttttttggggggtaaaaaaaaaaatggggggttttaaaap",
    "tgggggggggggttaaaatttattggggggggttttttaa",
    "gggggggggggggttttttgtttggggggggggggggttt",
    "gggggggggggggggtgggggggggggggggggggggggt",
    "gggggggggggggggggggggggggggggggggggggggg"
   ]
  ]
 },
 "iss": {
  "frames": [
   [
    "### ###   :   ### ###",
    "#*# ###   +   ### ###",
    " |   |   =#=   |   | ",
    "=+===+==[%@%]==+===+=",
    " |   |   =#=   |   | ",
    "### ###   +   ### ###",
    "### ###   :   ### ###"
   ],
   [
    "### ###   :   ### ###",
    "### ###   +   ### ###",
    " |   |   =#=   |   | ",
    "=+===+==[%@%]==+===+=",
    " |   |   =#=   |   | ",
    "### #*#   +   ### ###",
    "### ###   :   ### ###"
   ],
   [
    "### ###   :   ### ###",
    "### ###   +   #*# ###",
    " |   |   =#=   |   | ",
    "=+===+==[%@%]==+===+=",
    " |   |   =#=   |   | ",
    "### ###   +   ### ###",
    "### ###   :   ### ###"
   ],
   [
    "### ###   :   ### ###",
    "### ###   +   ### ###",
    " |   |   =#=   |   | ",
    "=+===+==[%@%]==+===+=",
    " |   |   =#=   |   | ",
    "### ###   +   ### #*#",
    "### ###   :   ### ###"
   ]
  ],
  "inks": [
   [
    "tttgtttgggtgggtttgttt",
    "tftgtttgggtgggtttgttt",
    "gtgggtgggtttgggtgggtg",
    "ttttttttttttttttttttt",
    "gtgggtgggtttgggtgggtg",
    "tttgtttgggtgggtttgttt",
    "tttgtttgggtgggtttgttt"
   ],
   [
    "tttgtttgggtgggtttgttt",
    "tttgtttgggtgggtttgttt",
    "gtgggtgggtttgggtgggtg",
    "ttttttttttttttttttttt",
    "gtgggtgggtttgggtgggtg",
    "tttgtatgggtgggtttgttt",
    "tttgtttgggtgggtttgttt"
   ],
   [
    "tttgtttgggtgggtttgttt",
    "tttgtttgggtgggtftgttt",
    "gtgggtgggtttgggtgggtg",
    "ttttttttttttttttttttt",
    "gtgggtgggtttgggtgggtg",
    "tttgtttgggtgggtttgttt",
    "tttgtttgggtgggtttgttt"
   ],
   [
    "tttgtttgggtgggtttgttt",
    "tttgtttgggtgggtttgttt",
    "gtgggtgggtttgggtgggtg",
    "ttttttttttttttttttttt",
    "gtgggtgggtttgggtgggtg",
    "tttgtttgggtgggtttgtat",
    "tttgtttgggtgggtttgttt"
   ]
  ]
 },
 "stars": {
  "frames": [
   [
    "                     .            ",
    "      *                           ",
    " +               .               +",
    "                                  ",
    "       .        .                 ",
    "                    *             ",
    "                        .         ",
    "      +      *     +           +  ",
    "          +                       ",
    "      +          +               ."
   ],
   [
    "                     +            ",
    "      +                           ",
    " .               .               *",
    "                                  ",
    "       .        .                 ",
    "                    +             ",
    "                        .         ",
    "      *      +     .           .  ",
    "          .                       ",
    "      *          .               +"
   ],
   [
    "                     *            ",
    "      .                           ",
    " +               .               +",
    "                                  ",
    "       .        .                 ",
    "                    .             ",
    "                        .         ",
    "      +      .     +           +  ",
    "          +                       ",
    "      +          +               *"
   ],
   [
    "                     +            ",
    "      +                           ",
    " *               .               .",
    "                                  ",
    "       .        .                 ",
    "                    +             ",
    "                        .         ",
    "      .      +     *           *  ",
    "          *                       ",
    "      .          *               +"
   ]
  ],
  "inks": [
   [
    "gggggggggggggggggggggtgggggggggggg",
    "ggggggtggggggggggggggggggggggggggg",
    "gtgggggggggggggggtgggggggggggggggt",
    "gggggggggggggggggggggggggggggggggg",
    "gggggggtggggggggtggggggggggggggggg",
    "ggggggggggggggggggggtggggggggggggg",
    "ggggggggggggggggggggggggtggggggggg",
    "ggggggtggggggtgggggtgggggggggggtgg",
    "ggggggggggtggggggggggggggggggggggg",
    "ggggggtggggggggggtgggggggggggggggt"
   ],
   [
    "gggggggggggggggggggggtgggggggggggg",
    "ggggggtggggggggggggggggggggggggggg",
    "gtgggggggggggggggtgggggggggggggggt",
    "gggggggggggggggggggggggggggggggggg",
    "gggggggtggggggggtggggggggggggggggg",
    "ggggggggggggggggggggtggggggggggggg",
    "ggggggggggggggggggggggggtggggggggg",
    "ggggggtggggggtgggggtgggggggggggtgg",
    "ggggggggggtggggggggggggggggggggggg",
    "ggggggtggggggggggtgggggggggggggggt"
   ],
   [
    "gggggggggggggggggggggtgggggggggggg",
    "ggggggtggggggggggggggggggggggggggg",
    "gtgggggggggggggggtgggggggggggggggt",
    "gggggggggggggggggggggggggggggggggg",
    "gggggggtggggggggtggggggggggggggggg",
    "ggggggggggggggggggggtggggggggggggg",
    "ggggggggggggggggggggggggtggggggggg",
    "ggggggtggggggtgggggtgggggggggggtgg",
    "ggggggggggtggggggggggggggggggggggg",
    "ggggggtggggggggggtgggggggggggggggt"
   ],
   [
    "gggggggggggggggggggggtgggggggggggg",
    "ggggggtggggggggggggggggggggggggggg",
    "gtgggggggggggggggtgggggggggggggggt",
    "gggggggggggggggggggggggggggggggggg",
    "gggggggtggggggggtggggggggggggggggg",
    "ggggggggggggggggggggtggggggggggggg",
    "ggggggggggggggggggggggggtggggggggg",
    "ggggggtggggggtgggggtgggggggggggtgg",
    "ggggggggggtggggggggggggggggggggggg",
    "ggggggtggggggggggtgggggggggggggggt"
   ]
  ]
 }
};
