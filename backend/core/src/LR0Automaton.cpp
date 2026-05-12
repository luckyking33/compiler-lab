#include "LR0Automaton.h"

#include <fstream>
#include <iostream>
#include <queue>
#include <set>
#include <sstream>
#include <stdexcept>

namespace {

std::string escapeJsonString(const std::string& text) {
    std::ostringstream escaped;
    for (std::size_t i = 0; i < text.size(); ++i) {
        const char ch = text[i];
        switch (ch) {
            case '\\':
                escaped << "\\\\";
                break;
            case '"':
                escaped << "\\\"";
                break;
            case '\b':
                escaped << "\\b";
                break;
            case '\f':
                escaped << "\\f";
                break;
            case '\n':
                escaped << "\\n";
                break;
            case '\r':
                escaped << "\\r";
                break;
            case '\t':
                escaped << "\\t";
                break;
            default:
                escaped << ch;
                break;
        }
    }
    return escaped.str();
}

}  // namespace

LR0Automaton::LR0Automaton(const Grammar& grammar)
    : grammar_(grammar), states_(), transitions_(), productions_by_lhs_(), built_(false) {
    if (!grammar_.isAugmented()) {
        grammar_.augmentGrammar();
    }
    indexProductions();
}

ItemSet LR0Automaton::closure(const ItemSet& I) const {
    ItemSet result = I;
    std::queue<Item> pending;

    for (std::set<Item>::const_iterator it = result.items.begin(); it != result.items.end(); ++it) {
        pending.push(*it);
    }

    while (!pending.empty()) {
        const Item current = pending.front();
        pending.pop();

        if (current.dot_pos >= current.production.rhs.size()) {
            continue;
        }

        const Symbol nextSymbol = current.production.rhs[current.dot_pos];
        if (!nextSymbol.isNonTerminal()) {
            continue;
        }

        const std::map<Symbol, std::vector<Production> >::const_iterator productionGroup =
            productions_by_lhs_.find(nextSymbol);
        if (productionGroup == productions_by_lhs_.end()) {
            continue;
        }

        const std::vector<Production>& productions = productionGroup->second;
        for (std::size_t i = 0; i < productions.size(); ++i) {
            const Item newItem(productions[i], 0);
            const std::pair<std::set<Item>::iterator, bool> inserted = result.items.insert(newItem);
            if (inserted.second) {
                pending.push(newItem);
            }
        }
    }

    return result;
}

ItemSet LR0Automaton::gotoSet(const ItemSet& I, const Symbol& X) const {
    std::set<Item> shiftedItems;

    for (std::set<Item>::const_iterator it = I.items.begin(); it != I.items.end(); ++it) {
        if (it->dot_pos >= it->production.rhs.size()) {
            continue;
        }
        if (!(it->production.rhs[it->dot_pos] == X)) {
            continue;
        }

        shiftedItems.insert(Item(it->production, it->dot_pos + 1));
    }

    if (shiftedItems.empty()) {
        return ItemSet();
    }

    return closure(ItemSet(shiftedItems));
}

void LR0Automaton::build() {
    states_.clear();
    transitions_.clear();
    built_ = false;

    if (grammar_.productions().empty()) {
        throw std::invalid_argument("Cannot build LR(0) automaton from an empty grammar.");
    }

    std::set<Item> startItems;
    startItems.insert(Item(grammar_.productions().front(), 0));
    const ItemSet startState = closure(ItemSet(startItems));

    states_.push_back(startState);

    std::queue<int> pendingStates;
    pendingStates.push(0);

    while (!pendingStates.empty()) {
        const int stateIndex = pendingStates.front();
        pendingStates.pop();

        std::set<Symbol> candidateSymbols;
        const ItemSet currentState = states_[static_cast<std::size_t>(stateIndex)];
        for (std::set<Item>::const_iterator it = currentState.items.begin();
             it != currentState.items.end();
             ++it) {
            if (it->dot_pos < it->production.rhs.size()) {
                candidateSymbols.insert(it->production.rhs[it->dot_pos]);
            }
        }

        for (std::set<Symbol>::const_iterator symbolIt = candidateSymbols.begin();
             symbolIt != candidateSymbols.end();
             ++symbolIt) {
            const ItemSet nextState = gotoSet(currentState, *symbolIt);
            if (nextState.items.empty()) {
                continue;
            }

            int nextStateIndex = findStateIndex(nextState);
            if (nextStateIndex < 0) {
                states_.push_back(nextState);
                nextStateIndex = static_cast<int>(states_.size()) - 1;
                pendingStates.push(nextStateIndex);
            }

            transitions_[stateIndex][*symbolIt] = nextStateIndex;
        }
    }

    built_ = true;
}

void LR0Automaton::checkConflicts() const {
    ensureBuilt();

    bool hasConflict = false;
    for (std::size_t stateIndex = 0; stateIndex < states_.size(); ++stateIndex) {
        std::vector<std::string> reduceItems;
        std::vector<std::string> shiftItems;

        const ItemSet& state = states_[stateIndex];
        for (std::set<Item>::const_iterator it = state.items.begin(); it != state.items.end(); ++it) {
            const bool isComplete = it->dot_pos == it->production.rhs.size();
            if (isComplete) {
                if (!isAcceptItem(*it)) {
                    reduceItems.push_back(formatItem(*it));
                }
                continue;
            }

            const Symbol nextSymbol = it->production.rhs[it->dot_pos];
            if (nextSymbol.isTerminal()) {
                shiftItems.push_back(formatItem(*it));
            }
        }

        if (!reduceItems.empty() && !shiftItems.empty()) {
            hasConflict = true;
            std::cout << "State I" << stateIndex
                      << ": Shift-Reduce Conflict\n";
            std::cout << "  Reduce items:\n";
            for (std::size_t i = 0; i < reduceItems.size(); ++i) {
                std::cout << "    " << reduceItems[i] << '\n';
            }
            std::cout << "  Shift items:\n";
            for (std::size_t i = 0; i < shiftItems.size(); ++i) {
                std::cout << "    " << shiftItems[i] << '\n';
            }
            std::cout << '\n';
        }

        if (reduceItems.size() >= 2) {
            hasConflict = true;
            std::cout << "State I" << stateIndex
                      << ": Reduce-Reduce Conflict\n";
            std::cout << "  Reduce items:\n";
            for (std::size_t i = 0; i < reduceItems.size(); ++i) {
                std::cout << "    " << reduceItems[i] << '\n';
            }
            std::cout << '\n';
        }
    }

    if (!hasConflict) {
        std::cout << "No LR(0) conflicts detected.\n";
    }
}

void LR0Automaton::printAutomaton() const {
    ensureBuilt();

    for (std::size_t stateIndex = 0; stateIndex < states_.size(); ++stateIndex) {
        std::cout << "I" << stateIndex << ":\n";

        const ItemSet& state = states_[stateIndex];
        for (std::set<Item>::const_iterator it = state.items.begin(); it != state.items.end(); ++it) {
            std::cout << "  " << formatItem(*it) << '\n';
        }

        const std::map<int, std::map<Symbol, int> >::const_iterator transitionRow =
            transitions_.find(static_cast<int>(stateIndex));
        if (transitionRow == transitions_.end() || transitionRow->second.empty()) {
            std::cout << "  (no transitions)\n";
        } else {
            for (std::map<Symbol, int>::const_iterator edgeIt = transitionRow->second.begin();
                 edgeIt != transitionRow->second.end();
                 ++edgeIt) {
                std::cout << "  I" << stateIndex << " -- " << edgeIt->first.name
                          << " --> I" << edgeIt->second << '\n';
            }
        }

        if (stateIndex + 1 < states_.size()) {
            std::cout << '\n';
        }
    }
}

void LR0Automaton::exportToJson(const std::string& filename) const {
    ensureBuilt();

    std::ofstream output(filename.c_str(), std::ios::out | std::ios::trunc);
    if (!output.is_open()) {
        throw std::runtime_error("Failed to open JSON output file: " + filename);
    }

    output << "{\n";
    output << "  \"nodes\": [\n";
    for (std::size_t stateIndex = 0; stateIndex < states_.size(); ++stateIndex) {
        output << "    {\n";
        output << "      \"id\": " << stateIndex << ",\n";
        output << "      \"items\": [\n";

        const ItemSet& state = states_[stateIndex];
        std::size_t itemIndex = 0;
        for (std::set<Item>::const_iterator it = state.items.begin(); it != state.items.end(); ++it, ++itemIndex) {
            output << "        \"" << escapeJsonString(formatItem(*it)) << "\"";
            if (itemIndex + 1 < state.items.size()) {
                output << ',';
            }
            output << '\n';
        }

        output << "      ]\n";
        output << "    }";
        if (stateIndex + 1 < states_.size()) {
            output << ',';
        }
        output << '\n';
    }
    output << "  ],\n";

    output << "  \"edges\": [\n";
    bool firstEdge = true;
    for (std::map<int, std::map<Symbol, int> >::const_iterator rowIt = transitions_.begin();
         rowIt != transitions_.end();
         ++rowIt) {
        for (std::map<Symbol, int>::const_iterator edgeIt = rowIt->second.begin();
             edgeIt != rowIt->second.end();
             ++edgeIt) {
            if (!firstEdge) {
                output << ",\n";
            }
            output << "    {\"from\": " << rowIt->first
                   << ", \"to\": " << edgeIt->second
                   << ", \"symbol\": \"" << escapeJsonString(edgeIt->first.name) << "\"}";
            firstEdge = false;
        }
    }
    if (!firstEdge) {
        output << '\n';
    }
    output << "  ]\n";
    output << "}\n";
}

const Grammar& LR0Automaton::grammar() const {
    return grammar_;
}

const std::vector<ItemSet>& LR0Automaton::states() const {
    return states_;
}

const std::map<int, std::map<Symbol, int> >& LR0Automaton::transitions() const {
    return transitions_;
}

bool LR0Automaton::isBuilt() const {
    return built_;
}

void LR0Automaton::indexProductions() {
    productions_by_lhs_.clear();

    const std::vector<Production>& allProductions = grammar_.productions();
    for (std::size_t i = 0; i < allProductions.size(); ++i) {
        productions_by_lhs_[allProductions[i].lhs].push_back(allProductions[i]);
    }
}

int LR0Automaton::findStateIndex(const ItemSet& state) const {
    for (std::size_t i = 0; i < states_.size(); ++i) {
        if (states_[i] == state) {
            return static_cast<int>(i);
        }
    }
    return -1;
}

bool LR0Automaton::isAcceptItem(const Item& item) const {
    if (grammar_.productions().empty()) {
        return false;
    }

    return item.dot_pos == item.production.rhs.size() &&
           item.production == grammar_.productions().front();
}

std::string LR0Automaton::formatItem(const Item& item) const {
    std::ostringstream output;
    output << item.production.lhs.name << " ->";

    if (item.production.rhs.empty()) {
        output << " epsilon .";
        return output.str();
    }

    for (std::size_t i = 0; i < item.production.rhs.size(); ++i) {
        if (i == item.dot_pos) {
            output << " .";
        }
        output << ' ' << item.production.rhs[i].name;
    }

    if (item.dot_pos == item.production.rhs.size()) {
        output << " .";
    }

    return output.str();
}

void LR0Automaton::ensureBuilt() const {
    if (!built_) {
        throw std::logic_error("Automaton not built. Call build() first.");
    }
}
