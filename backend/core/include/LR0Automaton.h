#ifndef LR0AUTOMATON_H
#define LR0AUTOMATON_H

#include "Grammar.h"

#include <map>
#include <string>
#include <vector>

// LR0Automaton 对应 LR(0) 项目集规范族自动机。
// states_ 中的下标就是状态编号 I0, I1, I2, ...
class LR0Automaton {
public:
    explicit LR0Automaton(const Grammar& grammar);

    ItemSet closure(const ItemSet& I) const;
    ItemSet gotoSet(const ItemSet& I, const Symbol& X) const;
    void build();
    void checkConflicts() const;
    void printAutomaton() const;
    void exportToJson(const std::string& filename) const;

    const Grammar& grammar() const;
    const std::vector<ItemSet>& states() const;
    const std::map<int, std::map<Symbol, int> >& transitions() const;
    bool isBuilt() const;

private:
    void indexProductions();
    int findStateIndex(const ItemSet& state) const;
    bool isAcceptItem(const Item& item) const;
    std::string formatItem(const Item& item) const;
    void ensureBuilt() const;

    Grammar grammar_;
    std::vector<ItemSet> states_;
    std::map<int, std::map<Symbol, int> > transitions_;
    std::map<Symbol, std::vector<Production> > productions_by_lhs_;
    bool built_;
};

#endif  // LR0AUTOMATON_H
