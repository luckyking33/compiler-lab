#ifndef GRAMMAR_H
#define GRAMMAR_H

#include <cstddef>
#include <set>
#include <string>
#include <vector>

// 文法符号类别：终结符和非终结符。
enum class SymbolType {
    Terminal,
    NonTerminal
};

// Symbol 对应编译原理中的“文法符号”。
// 例如：id、+ 是终结符，E、T、F 是非终结符。
struct Symbol {
    std::string name;
    SymbolType type;

    Symbol();
    Symbol(const std::string& symbolName, SymbolType symbolType);

    bool isTerminal() const;
    bool isNonTerminal() const;

    bool operator==(const Symbol& other) const;
    bool operator<(const Symbol& other) const;
};

// Production 对应“产生式” A -> alpha。
// lhs 是左部非终结符，rhs 是右部符号串；若 rhs 为空则表示空产生式。
struct Production {
    Symbol lhs;
    std::vector<Symbol> rhs;

    Production();
    Production(const Symbol& left, const std::vector<Symbol>& right);

    bool operator==(const Production& other) const;
    bool operator<(const Production& other) const;
};

// Item 对应 LR(0) 项 A -> alpha . beta。
// dot_pos 表示圆点在 rhs 中的位置，0 表示最前面，rhs.size() 表示最末尾。
struct Item {
    Production production;
    std::size_t dot_pos;

    Item();
    Item(const Production& prod, std::size_t dotPosition);

    bool operator==(const Item& other) const;
    bool operator<(const Item& other) const;
};

// ItemSet 对应 LR(0) 项目集，即若干 Item 的集合。
struct ItemSet {
    std::set<Item> items;

    ItemSet();
    explicit ItemSet(const std::set<Item>& itemCollection);

    bool operator==(const ItemSet& other) const;
    bool operator<(const ItemSet& other) const;
};

// Grammar 保存一个文法的所有基础信息：
// 1. productions_：所有产生式
// 2. terminals_：终结符集合
// 3. non_terminals_：非终结符集合
// 4. start_symbol_：开始符号
// 5. augmented_：是否已经增广
class Grammar {
public:
    Grammar();
    Grammar(const std::vector<Production>& productions,
            const std::set<Symbol>& terminals,
            const std::set<Symbol>& nonTerminals,
            const Symbol& startSymbol,
            bool augmented = false);

    const std::vector<Production>& productions() const;
    const std::set<Symbol>& terminals() const;
    const std::set<Symbol>& nonTerminals() const;
    const Symbol& startSymbol() const;
    bool isAugmented() const;

    // 自动将文法增广为 S' -> S，其中 S 为当前开始符号。
    void augmentGrammar();

private:
    void validateState() const;

    std::vector<Production> productions_;
    std::set<Symbol> terminals_;
    std::set<Symbol> non_terminals_;
    Symbol start_symbol_;
    bool augmented_;
};

// 将类似 "E -> E + T | T" 的规则解析为 Grammar。
// 约定：按空白分词；所有左部符号自动判定为非终结符。
Grammar parseGrammar(const std::vector<std::string>& rules);

#endif  // GRAMMAR_H
