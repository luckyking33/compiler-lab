#include "Grammar.h"

#include <sstream>
#include <stdexcept>
#include <utility>

namespace {

const char* const kArrow = "->";
const char* const kUtf8Epsilon = "\xCE\xB5";

std::string trim(const std::string& text) {
    const std::string whitespace = " \t\r\n";
    const std::size_t first = text.find_first_not_of(whitespace);
    if (first == std::string::npos) {
        return "";
    }

    const std::size_t last = text.find_last_not_of(whitespace);
    return text.substr(first, last - first + 1);
}

std::vector<std::string> splitByWhitespace(const std::string& text) {
    std::vector<std::string> tokens;
    std::istringstream input(text);
    std::string token;
    while (input >> token) {
        tokens.push_back(token);
    }
    return tokens;
}

std::vector<std::string> splitAlternatives(const std::string& text) {
    std::vector<std::string> alternatives;
    std::string current;
    for (std::size_t i = 0; i < text.size(); ++i) {
        if (text[i] == '|') {
            alternatives.push_back(current);
            current.clear();
        } else {
            current += text[i];
        }
    }
    alternatives.push_back(current);
    return alternatives;
}

bool isEpsilonToken(const std::string& token) {
    return token == "epsilon" || token == "eps" || token == kUtf8Epsilon;
}

void validateSymbolName(const std::string& name, const std::string& context) {
    if (trim(name).empty()) {
        throw std::invalid_argument(context + " cannot be empty.");
    }
}

bool containsSymbolName(const std::set<Symbol>& symbols, const std::string& name) {
    for (std::set<Symbol>::const_iterator it = symbols.begin(); it != symbols.end(); ++it) {
        if (it->name == name) {
            return true;
        }
    }
    return false;
}

bool grammarContainsSymbolName(const Grammar& grammar, const std::string& name) {
    return containsSymbolName(grammar.terminals(), name) ||
           containsSymbolName(grammar.nonTerminals(), name);
}

}  // namespace

Symbol::Symbol() : name(), type(SymbolType::Terminal) {}

Symbol::Symbol(const std::string& symbolName, SymbolType symbolType)
    : name(symbolName), type(symbolType) {
    validateSymbolName(name, "Symbol name");
}

bool Symbol::isTerminal() const {
    return type == SymbolType::Terminal;
}

bool Symbol::isNonTerminal() const {
    return type == SymbolType::NonTerminal;
}

bool Symbol::operator==(const Symbol& other) const {
    return name == other.name && type == other.type;
}

bool Symbol::operator<(const Symbol& other) const {
    if (type != other.type) {
        return type < other.type;
    }
    return name < other.name;
}

Production::Production() : lhs(Symbol("DEFAULT_LHS", SymbolType::NonTerminal)), rhs() {}

Production::Production(const Symbol& left, const std::vector<Symbol>& right)
    : lhs(left), rhs(right) {
    if (!lhs.isNonTerminal()) {
        throw std::invalid_argument("Production lhs must be a non-terminal.");
    }
}

bool Production::operator==(const Production& other) const {
    return lhs == other.lhs && rhs == other.rhs;
}

bool Production::operator<(const Production& other) const {
    if (lhs < other.lhs) {
        return true;
    }
    if (other.lhs < lhs) {
        return false;
    }
    return rhs < other.rhs;
}

Item::Item() : production(), dot_pos(0) {}

Item::Item(const Production& prod, std::size_t dotPosition)
    : production(prod), dot_pos(dotPosition) {
    if (dot_pos > production.rhs.size()) {
        throw std::invalid_argument("dot_pos is out of range for the production rhs.");
    }
}

bool Item::operator==(const Item& other) const {
    return production == other.production && dot_pos == other.dot_pos;
}

bool Item::operator<(const Item& other) const {
    if (production < other.production) {
        return true;
    }
    if (other.production < production) {
        return false;
    }
    return dot_pos < other.dot_pos;
}

ItemSet::ItemSet() : items() {}

ItemSet::ItemSet(const std::set<Item>& itemCollection) : items(itemCollection) {}

bool ItemSet::operator==(const ItemSet& other) const {
    return items == other.items;
}

bool ItemSet::operator<(const ItemSet& other) const {
    return items < other.items;
}

Grammar::Grammar()
    : productions_(),
      terminals_(),
      non_terminals_(),
      start_symbol_("DEFAULT_START", SymbolType::NonTerminal),
      augmented_(false) {}

Grammar::Grammar(const std::vector<Production>& productions,
                 const std::set<Symbol>& terminals,
                 const std::set<Symbol>& nonTerminals,
                 const Symbol& startSymbol,
                 bool augmented)
    : productions_(productions),
      terminals_(terminals),
      non_terminals_(nonTerminals),
      start_symbol_(startSymbol),
      augmented_(augmented) {
    validateState();
}

const std::vector<Production>& Grammar::productions() const {
    return productions_;
}

const std::set<Symbol>& Grammar::terminals() const {
    return terminals_;
}

const std::set<Symbol>& Grammar::nonTerminals() const {
    return non_terminals_;
}

const Symbol& Grammar::startSymbol() const {
    return start_symbol_;
}

bool Grammar::isAugmented() const {
    return augmented_;
}

void Grammar::augmentGrammar() {
    if (augmented_) {
        return;
    }
    if (productions_.empty()) {
        throw std::invalid_argument("Cannot augment an empty grammar.");
    }
    if (!start_symbol_.isNonTerminal()) {
        throw std::invalid_argument("Start symbol must be a non-terminal.");
    }

    Symbol originalStart = start_symbol_;
    std::string augmentedName = originalStart.name + "'";
    while (grammarContainsSymbolName(*this, augmentedName)) {
        augmentedName += "'";
    }

    Symbol augmentedStart(augmentedName, SymbolType::NonTerminal);
    std::vector<Symbol> rhs;
    rhs.push_back(originalStart);
    productions_.insert(productions_.begin(), Production(augmentedStart, rhs));
    non_terminals_.insert(augmentedStart);
    start_symbol_ = augmentedStart;
    augmented_ = true;
}

void Grammar::validateState() const {
    if (productions_.empty()) {
        throw std::invalid_argument("Grammar must contain at least one production.");
    }
    if (!start_symbol_.isNonTerminal()) {
        throw std::invalid_argument("Start symbol must be a non-terminal.");
    }
    if (non_terminals_.find(start_symbol_) == non_terminals_.end()) {
        throw std::invalid_argument("Start symbol must exist in the non-terminal set.");
    }

    for (std::vector<Production>::const_iterator it = productions_.begin();
         it != productions_.end();
         ++it) {
        if (!it->lhs.isNonTerminal()) {
            throw std::invalid_argument("Each production lhs must be a non-terminal.");
        }
    }
}

Grammar parseGrammar(const std::vector<std::string>& rules) {
    if (rules.empty()) {
        throw std::invalid_argument("Grammar rules cannot be empty.");
    }

    std::vector<std::pair<std::string, std::string> > rawRules;
    std::set<std::string> nonTerminalNames;
    std::string startName;

    for (std::size_t i = 0; i < rules.size(); ++i) {
        const std::string rule = trim(rules[i]);
        if (rule.empty()) {
            throw std::invalid_argument("Grammar rule cannot be empty.");
        }

        const std::size_t arrowPos = rule.find(kArrow);
        if (arrowPos == std::string::npos) {
            throw std::invalid_argument("Each rule must contain '->'.");
        }

        const std::string lhsText = trim(rule.substr(0, arrowPos));
        const std::string rhsText = rule.substr(arrowPos + 2);
        const std::vector<std::string> lhsTokens = splitByWhitespace(lhsText);

        if (lhsTokens.empty()) {
            throw std::invalid_argument("Production lhs cannot be empty.");
        }
        if (lhsTokens.size() != 1) {
            throw std::invalid_argument("Production lhs must contain exactly one symbol.");
        }

        if (i == 0) {
            startName = lhsTokens[0];
        }

        nonTerminalNames.insert(lhsTokens[0]);
        rawRules.push_back(std::make_pair(lhsTokens[0], rhsText));
    }

    std::vector<Production> productions;
    std::set<Symbol> terminals;
    std::set<Symbol> nonTerminals;

    for (std::size_t i = 0; i < rawRules.size(); ++i) {
        const Symbol lhs(rawRules[i].first, SymbolType::NonTerminal);
        const std::vector<std::string> alternatives = splitAlternatives(rawRules[i].second);

        nonTerminals.insert(lhs);
        for (std::size_t j = 0; j < alternatives.size(); ++j) {
            const std::string alternative = trim(alternatives[j]);
            if (alternative.empty()) {
                throw std::invalid_argument(
                    "Empty production alternative is not allowed. Use epsilon explicitly.");
            }

            const std::vector<std::string> rhsTokens = splitByWhitespace(alternative);
            const bool isEpsilonProduction =
                rhsTokens.size() == 1 && isEpsilonToken(rhsTokens[0]);

            std::vector<Symbol> rhsSymbols;
            if (!isEpsilonProduction) {
                for (std::size_t k = 0; k < rhsTokens.size(); ++k) {
                    if (isEpsilonToken(rhsTokens[k])) {
                        throw std::invalid_argument(
                            "epsilon/eps/the UTF-8 epsilon token must appear alone.");
                    }

                    const SymbolType symbolType =
                        nonTerminalNames.count(rhsTokens[k]) > 0
                            ? SymbolType::NonTerminal
                            : SymbolType::Terminal;
                    const Symbol symbol(rhsTokens[k], symbolType);
                    rhsSymbols.push_back(symbol);
                    if (symbol.isNonTerminal()) {
                        nonTerminals.insert(symbol);
                    } else {
                        terminals.insert(symbol);
                    }
                }
            }

            productions.push_back(Production(lhs, rhsSymbols));
        }
    }

    return Grammar(productions,
                   terminals,
                   nonTerminals,
                   Symbol(startName, SymbolType::NonTerminal),
                   false);
}
