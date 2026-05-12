#include "Grammar.h"
#include "LR0Automaton.h"
#include "Scanner.h"

#include <fstream>
#include <iostream>
#include <sstream>
#include <stdexcept>
#include <string>
#include <vector>

#ifdef _WIN32
extern "C" __declspec(dllimport) int __stdcall SetConsoleOutputCP(unsigned int codePage);
extern "C" __declspec(dllimport) int __stdcall SetConsoleCP(unsigned int codePage);
#endif

namespace {

void configureUtf8Console() {
#ifdef _WIN32
    const unsigned int kUtf8CodePage = 65001U;
    SetConsoleOutputCP(kUtf8CodePage);
    SetConsoleCP(kUtf8CodePage);
#endif
}

void printUsage(const char* programName) {
    std::cerr << "Usage:\n"
              << "  " << programName << " scan <source-file> [tokens-out]\n"
              << "  " << programName << " lr0 <grammar-file> [json-out]\n";
}

std::string trim(const std::string& text) {
    const std::string whitespace = " \t\r\n";
    const std::size_t first = text.find_first_not_of(whitespace);
    if (first == std::string::npos) {
        return "";
    }

    const std::size_t last = text.find_last_not_of(whitespace);
    return text.substr(first, last - first + 1);
}

std::vector<std::string> readGrammarRules(const std::string& filename) {
    std::ifstream input(filename.c_str(), std::ios::in);
    if (!input.is_open()) {
        throw std::runtime_error("Failed to open grammar file: " + filename);
    }

    std::vector<std::string> rules;
    std::string line;
    while (std::getline(input, line)) {
        const std::string cleaned = trim(line);
        if (!cleaned.empty() && cleaned[0] != '#') {
            rules.push_back(cleaned);
        }
    }

    if (rules.empty()) {
        throw std::runtime_error("Grammar file contains no rules: " + filename);
    }

    return rules;
}

int runScan(int argc, char* argv[]) {
    if (argc < 3 || argc > 4) {
        printUsage(argv[0]);
        return 2;
    }

    const std::string sourceFilename = argv[2];
    const bool writeFile = argc == 4;
    const std::string outputFilename = writeFile ? argv[3] : "";

    Scanner scanner;
    if (!scanner.loadFromFile(sourceFilename)) {
        std::cerr << "Failed to open source file: " << sourceFilename << '\n';
        return 1;
    }

    std::ofstream output;
    if (writeFile) {
        output.open(outputFilename.c_str(), std::ios::out | std::ios::trunc);
        if (!output.is_open()) {
            std::cerr << "Failed to create output file: " << outputFilename << '\n';
            return 1;
        }
    }

    while (true) {
        const Token token = scanner.getNextToken();
        if (token.type == TokenType::END_OF_FILE) {
            break;
        }

        const std::string line = "(" + tokenTypeToString(token.type) + ", " + token.value + ")";
        std::cout << line << '\n';
        if (writeFile) {
            output << line << '\n';
        }
    }

    return 0;
}

int runLr0(int argc, char* argv[]) {
    if (argc < 3 || argc > 4) {
        printUsage(argv[0]);
        return 2;
    }

    const std::string grammarFilename = argv[2];
    const std::string jsonFilename = argc == 4 ? argv[3] : "lr0_automaton.json";

    const std::vector<std::string> rules = readGrammarRules(grammarFilename);
    Grammar grammar = parseGrammar(rules);
    LR0Automaton automaton(grammar);
    automaton.build();
    automaton.exportToJson(jsonFilename);

    std::cout << "LR(0) automaton exported to " << jsonFilename << '\n';
    return 0;
}

}  // namespace

int main(int argc, char* argv[]) {
    configureUtf8Console();

    if (argc < 2) {
        printUsage(argv[0]);
        return 2;
    }

    try {
        const std::string command = argv[1];
        if (command == "scan") {
            return runScan(argc, argv);
        }
        if (command == "lr0") {
            return runLr0(argc, argv);
        }

        std::cerr << "Unknown command: " << command << '\n';
        printUsage(argv[0]);
        return 2;
    } catch (const std::exception& error) {
        std::cerr << "Error: " << error.what() << '\n';
        return 1;
    }
}
